/* NoxOS - shell kernel
 *
 * Boucle : lire une ligne (clavier PS/2 ou port serie), la decouper en
 * mots, executer la commande correspondante. Ce shell tourne dans le
 * kernel ; il sera remplace par un vrai terminal utilisateur quand les
 * processus utilisateur existeront (v0.3+).
 */
#include <nox/shell.h>
#include <nox/printk.h>
#include <nox/keyboard.h>
#include <nox/serial.h>
#include <nox/string.h>
#include <nox/memory.h>
#include <nox/pmm.h>
#include <nox/paging.h>
#include <nox/thread.h>
#include <nox/cpu.h>
#include <nox/timer.h>
#include <nox/vga.h>
#include <nox/io.h>
#include <nox/ata.h>
#include <nox/fs.h>
#include <nox/process.h>

#define LINE_MAX 128
#define ARGS_MAX 8

struct command {
    const char *name;
    const char *help;
    void (*fn)(int argc, char **argv);
};

static void cmd_help(int argc, char **argv);
static void cmd_clear(int argc, char **argv);
static void cmd_echo(int argc, char **argv);
static void cmd_version(int argc, char **argv);
static void cmd_cpu(int argc, char **argv);
static void cmd_memory(int argc, char **argv);
static void cmd_uptime(int argc, char **argv);
static void cmd_frames(int argc, char **argv);
static void cmd_ps(int argc, char **argv);
static void cmd_spawn(int argc, char **argv);
static void cmd_run(int argc, char **argv);
static void cmd_procs(int argc, char **argv);
static void cmd_heaptest(int argc, char **argv);
static void cmd_disk(int argc, char **argv);
static void cmd_ls(int argc, char **argv);
static void cmd_cat(int argc, char **argv);
static void cmd_cd(int argc, char **argv);
static void cmd_pwd(int argc, char **argv);

static void cmd_reboot(int argc, char **argv);
static void cmd_halt(int argc, char **argv);

static int cwd;                        /* index NoxFS du repertoire courant */

static const struct command commands[] = {
    { "help",    "list available commands",            cmd_help },
    { "clear",   "clear the screen",                   cmd_clear },
    { "echo",    "print arguments",                    cmd_echo },
    { "version", "show NoxOS version",                 cmd_version },
    { "cpu",     "show processor information",         cmd_cpu },
    { "memory",  "show memory map, frames and heap",   cmd_memory },
    { "uptime",  "time since boot",                    cmd_uptime },
    { "frames",  "physical frames in use (one line)",  cmd_frames },
    { "ps",      "list kernel threads",                cmd_ps },
    { "spawn",   "spawn N demo threads (default 2)",   cmd_spawn },
    { "run",     "run a user program (ring 3), & = background", cmd_run },
    { "procs",   "list user processes",               cmd_procs },
    { "heaptest","allocate/free stress test",          cmd_heaptest },
    { "disk",    "show ATA disk and NoxFS info",       cmd_disk },
    { "ls",      "list directory",                     cmd_ls },
    { "cat",     "print a file",                       cmd_cat },
    { "cd",      "change directory",                   cmd_cd },
    { "pwd",     "print current directory",            cmd_pwd },
    { "reboot",  "restart the machine",                cmd_reboot },
    { "halt",    "stop the CPU",                       cmd_halt },
};

#define NUM_COMMANDS (sizeof(commands) / sizeof(commands[0]))

static void cmd_help(int argc, char **argv)
{
    (void)argc; (void)argv;
    kprintf("NoxOS shell commands:\n");
    for (u32 i = 0; i < NUM_COMMANDS; i++)
        kprintf("  %-8s  %s\n", commands[i].name, commands[i].help);
}

static void cmd_clear(int argc, char **argv)
{
    (void)argc; (void)argv;
    console_clear();
}

static void cmd_echo(int argc, char **argv)
{
    for (int i = 1; i < argc; i++)
        kprintf(i + 1 < argc ? "%s " : "%s", argv[i]);
    kputc('\n');
}

static void cmd_version(int argc, char **argv)
{
    (void)argc; (void)argv;
    kprintf("NoxOS %s - Built from scratch.\n", KERNEL_VERSION);
    kprintf("Kernel: %s (i386, 32-bit protected mode)\n", KERNEL_NAME);
}

static void cmd_cpu(int argc, char **argv)
{
    (void)argc; (void)argv;
    struct cpu_info info;
    cpu_detect(&info);
    kprintf("Vendor  : %s\n", info.vendor);
    kprintf("Brand   : %s\n", info.brand);
    kprintf("Family  : %u  Model: %u  Stepping: %u\n",
            info.family, info.model, info.stepping);
    kprintf("Features:%s%s%s%s%s\n",
            info.has_fpu  ? " fpu"  : "",
            info.has_pae  ? " pae"  : "",
            info.has_apic ? " apic" : "",
            info.has_sse  ? " sse"  : "",
            info.has_sse2 ? " sse2" : "");
}

static void cmd_memory(int argc, char **argv)
{
    (void)argc; (void)argv;
    kprintf("Physical memory map (E820):\n");
    memory_print_map();
    kprintf("Total usable : %u KB (%u MB)\n",
            memory_total_usable_kb(), memory_total_usable_kb() / 1024);
    kprintf("Frames (4 KB): %u total, %u used, %u free (%u MB free)\n",
            pmm_total_frames(), pmm_used_frames(), pmm_free_frames(),
            pmm_free_frames() / 256);
    kprintf("Paging       : identity 0 - 0x%x, %u page tables\n",
            pmm_ram_top(), paging_table_count());
    kprintf("Kernel heap  : %u bytes used / %u KB mapped at 0x%x\n",
            heap_used_bytes(), heap_mapped_bytes() / 1024, KHEAP_START);
}

static void cmd_frames(int argc, char **argv)
{
    (void)argc; (void)argv;
    kprintf("frames used: %u, page tables: %u\n",
            pmm_used_frames(), paging_table_count());
}

static void cmd_ps(int argc, char **argv)
{
    (void)argc; (void)argv;
    kprintf("%u threads:\n", thread_count());
    sched_dump();
}

static void cmd_procs(int argc, char **argv)
{
    (void)argc; (void)argv;
    kprintf("%u running process(es):\n", process_count());
    process_dump();
}

/* run <fichier> [&] : charge un binaire NoxFS et l'execute en ring 3.
 * Sans '&', le shell attend la fin du processus et affiche son code. */
static void cmd_run(int argc, char **argv)
{
    if (argc < 2) {
        kprintf("usage: run <program> [&]\n");
        return;
    }
    bool background = argc > 2 && strcmp(argv[2], "&") == 0;

    char path[128];
    if (argv[1][0] == '/') {
        strcpy(path, argv[1]);
    } else {
        /* nom simple -> /bin/<nom>, sinon relatif au repertoire courant */
        int idx = fs_lookup(argv[1], cwd);
        if (idx >= 0) {
            fs_path_of(idx, path, sizeof(path));
        } else {
            strcpy(path, "/bin/");
            size_t n = strlen(argv[1]);
            if (n > sizeof(path) - 6)
                n = sizeof(path) - 6;
            memcpy(path + 5, argv[1], n);
            path[5 + n] = '\0';
        }
    }

    int pid = process_spawn(path);
    if (pid < 0) {
        kprintf("run: cannot start '%s' (error %d)\n", path, pid);
        return;
    }
    if (background) {
        kprintf("[%d] %s\n", pid, path);
        return;
    }
    console_set_owner((u32)pid);
    int code = process_wait((u32)pid);
    console_set_owner(0);
    kprintf("[pid %d exited with code %d]\n", pid, code);
}

/* Thread de demonstration : affiche quelques messages en dormant entre
 * chaque, ce qui montre que le shell reste utilisable en parallele. */
static void demo_thread(void *arg)
{
    u32 n = (u32)arg;
    for (u32 i = 1; i <= 3; i++) {
        kprintf("[%s] step %u/3\n", thread_current()->name, i);
        thread_sleep_ms(300 + 100 * n);
    }
    kprintf("[%s] finished\n", thread_current()->name);
}

static void cmd_spawn(int argc, char **argv)
{
    u32 count = 2;
    if (argc > 1) {
        count = 0;
        for (const char *p = argv[1]; *p >= '0' && *p <= '9'; p++)
            count = count * 10 + (u32)(*p - '0');
    }
    if (count == 0 || count > 16) {
        kprintf("spawn: count must be 1..16\n");
        return;
    }
    for (u32 i = 0; i < count; i++) {
        char name[THREAD_NAME_MAX] = "demo-";
        name[5] = (char)('0' + (i / 10));
        name[6] = (char)('0' + (i % 10));
        name[7] = '\0';
        struct thread *t = thread_create(name, demo_thread, (void *)i);
        kprintf("spawned thread %u '%s'\n", t->id, t->name);
    }
}

static void cmd_heaptest(int argc, char **argv)
{
    (void)argc; (void)argv;
    u32 before = heap_used_bytes();
    void *p[64];

    for (u32 round = 0; round < 4; round++) {
        for (u32 i = 0; i < 64; i++) {
            p[i] = kmalloc(16 + (i * 37) % 3000);
            memset(p[i], (int)i, 16);
        }
        for (u32 i = 0; i < 64; i += 2)          /* libere un bloc sur deux */
            kfree(p[i]);
        void *big = kmalloc_aligned(8192, 4096);
        if (((uintptr_t)big & 0xFFF) != 0) {
            kprintf("heap test FAILED: bad alignment %p\n", big);
            return;
        }
        for (u32 i = 1; i < 64; i += 2)
            kfree(p[i]);
        kfree(big);
        if (!heap_check()) {
            kprintf("heap test FAILED: corrupted block list (round %u)\n", round);
            return;
        }
    }

    if (heap_used_bytes() != before) {
        kprintf("heap test FAILED: leak of %u bytes\n", heap_used_bytes() - before);
        return;
    }
    kprintf("heap test ok (%u KB mapped, %u bytes in use)\n",
            heap_mapped_bytes() / 1024, heap_used_bytes());
}

static void cmd_disk(int argc, char **argv)
{
    (void)argc; (void)argv;
    if (ata_sector_count() == 0) {
        kprintf("No ATA disk detected.\n");
        return;
    }
    kprintf("ATA disk : %s, %u sectors (%u MB)\n",
            ata_model(), ata_sector_count(), ata_sector_count() / 2048);
    if (!fs_mounted()) {
        kprintf("NoxFS    : not mounted\n");
        return;
    }
    const struct noxfs_super *sb = fs_super();
    kprintf("NoxFS    : '%s' v%u at LBA %u, %u blocks of %u bytes, %u used\n",
            sb->label, sb->version, NOXFS_DISK_LBA, sb->total_blocks,
            sb->block_size, fs_used_blocks());
}

static void cmd_ls(int argc, char **argv)
{
    if (!fs_mounted()) {
        kprintf("ls: NoxFS not mounted\n");
        return;
    }
    int dir = argc > 1 ? fs_lookup(argv[1], cwd) : cwd;
    const struct noxfs_entry *d = fs_entry(dir);
    if (!d) {
        kprintf("ls: no such file or directory\n");
        return;
    }
    if (d->type != NOXFS_DIR) {
        kprintf("%8u  %s\n", d->size, d->name);
        return;
    }
    for (int i = fs_next_child(dir, -1); i >= 0; i = fs_next_child(dir, i)) {
        const struct noxfs_entry *e = fs_entry(i);
        if (e->type == NOXFS_DIR)
            kprintf("   <DIR>  %s/\n", e->name);
        else
            kprintf("%8u  %s\n", e->size, e->name);
    }
}

static void cmd_cat(int argc, char **argv)
{
    if (argc < 2) {
        kprintf("usage: cat <file>\n");
        return;
    }
    int idx = fs_lookup(argv[1], cwd);
    const struct noxfs_entry *e = fs_entry(idx);
    if (!e || e->type != NOXFS_FILE) {
        kprintf("cat: %s: not a file\n", argv[1]);
        return;
    }
    char buf[256];
    char last = '\n';
    u32 off = 0;
    int n;
    while ((n = fs_read(idx, off, buf, sizeof(buf))) > 0) {
        for (int i = 0; i < n; i++)
            kputc(buf[i]);
        last = buf[n - 1];
        off += (u32)n;
    }
    if (n < 0)
        kprintf("cat: read error\n");
    else if (last != '\n')
        kputc('\n');
}

static void cmd_cd(int argc, char **argv)
{
    int idx = fs_lookup(argc > 1 ? argv[1] : "/", cwd);
    const struct noxfs_entry *e = fs_entry(idx);
    if (!e || e->type != NOXFS_DIR) {
        kprintf("cd: not a directory\n");
        return;
    }
    cwd = idx;
}

static void cmd_pwd(int argc, char **argv)
{
    (void)argc; (void)argv;
    char path[128];
    fs_path_of(cwd, path, sizeof(path));
    kprintf("%s\n", path);
}

static void cmd_uptime(int argc, char **argv)
{
    (void)argc; (void)argv;
    u32 ms = timer_uptime_ms();
    kprintf("Uptime: %u.%02u s (%u ticks at %u Hz)\n",
            ms / 1000, (ms % 1000) / 10, timer_ticks(), TIMER_HZ);
}

static void cmd_reboot(int argc, char **argv)
{
    (void)argc; (void)argv;
    kprintf("Rebooting...\n");
    cpu_reboot();
}

static void cmd_halt(int argc, char **argv)
{
    (void)argc; (void)argv;
    kprintf("System halted.\n");
    cpu_halt();
}

static void read_line(char *line, size_t max)
{
    size_t len = 0;
    for (;;) {
        char c = console_getc();
        if (c == '\n') {
            kputc('\n');
            break;
        }
        if (c == '\b' || c == 127) {
            if (len > 0) {
                len--;
                kputs("\b \b");
            }
            continue;
        }
        if (c == 0x03) {                    /* Ctrl+C : annule la ligne */
            kputs("^C\n");
            len = 0;
            break;
        }
        if (c < 32 || len + 1 >= max)
            continue;
        line[len++] = c;
        kputc(c);
    }
    line[len] = '\0';
}

static int split_args(char *line, char **argv)
{
    int argc = 0;
    char *p = line;
    while (*p && argc < ARGS_MAX) {
        while (*p == ' ' || *p == '\t')
            p++;
        if (!*p)
            break;
        argv[argc++] = p;
        while (*p && *p != ' ' && *p != '\t')
            p++;
        if (*p)
            *p++ = '\0';
    }
    return argc;
}

static void execute(int argc, char **argv)
{
    for (u32 i = 0; i < NUM_COMMANDS; i++) {
        if (strcmp(argv[0], commands[i].name) == 0) {
            commands[i].fn(argc, argv);
            return;
        }
    }
    kprintf("Unknown command: '%s' (type 'help')\n", argv[0]);
}

void shell_run(void)
{
    static char line[LINE_MAX];
    char *argv[ARGS_MAX];

    kprintf("Type 'help' for a list of commands.\n\n");

    for (;;) {
        console_set_color(VGA_LIGHT_CYAN, VGA_BLACK);
        u32 pid;
        int code;
        while (process_collect(&pid, &code))
            kprintf("[pid %u exited with code %d]\n", pid, code);
        kputs("nox> ");
        console_set_color(VGA_LIGHT_GREY, VGA_BLACK);

        read_line(line, LINE_MAX);
        int argc = split_args(line, argv);
        if (argc > 0)
            execute(argc, argv);
    }
}
