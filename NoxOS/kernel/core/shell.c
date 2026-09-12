/* NoxOS - shell kernel v0.1
 *
 * Boucle : lire une ligne (clavier PS/2 ou port serie), la decouper en
 * mots, executer la commande correspondante. Ce shell tourne dans le
 * kernel ; il sera remplace par un vrai terminal utilisateur quand les
 * processus existeront (v0.2+).
 */
#include <nox/shell.h>
#include <nox/printk.h>
#include <nox/keyboard.h>
#include <nox/serial.h>
#include <nox/string.h>
#include <nox/memory.h>
#include <nox/cpu.h>
#include <nox/timer.h>
#include <nox/vga.h>
#include <nox/io.h>

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
static void cmd_reboot(int argc, char **argv);
static void cmd_halt(int argc, char **argv);

static const struct command commands[] = {
    { "help",    "list available commands",            cmd_help },
    { "clear",   "clear the screen",                   cmd_clear },
    { "echo",    "print arguments",                    cmd_echo },
    { "version", "show NoxOS version",                 cmd_version },
    { "cpu",     "show processor information",         cmd_cpu },
    { "memory",  "show memory map and kernel heap",    cmd_memory },
    { "uptime",  "time since boot",                    cmd_uptime },
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
    vga_clear();
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
    kprintf("Kernel heap  : %u / %u bytes used\n",
            memory_heap_used(), memory_heap_size());
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

/* Lit un caractere depuis le clavier OU le port serie (utile pour les
 * tests automatiques avec QEMU -serial stdio). */
static char read_char(void)
{
    char c;
    for (;;) {
        if (keyboard_poll(&c))
            return c;
        if (serial_has_char()) {
            c = serial_getc();
            return c == '\r' ? '\n' : c;
        }
        hlt();
    }
}

static void read_line(char *line, size_t max)
{
    size_t len = 0;
    for (;;) {
        char c = read_char();
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
        vga_set_color(VGA_LIGHT_CYAN, VGA_BLACK);
        kputs("nox> ");
        vga_set_color(VGA_LIGHT_GREY, VGA_BLACK);

        read_line(line, LINE_MAX);
        int argc = split_args(line, argv);
        if (argc > 0)
            execute(argc, argv);
    }
}
