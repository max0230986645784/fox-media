/* NoxOS - processus utilisateur : chargement, espace d'adressage, fin
 *
 * Cycle de vie :
 *   process_spawn()  lit le binaire dans NoxFS, cree un repertoire de pages
 *                    prive, y mappe l'image (USER_BASE) et une pile
 *                    (sous USER_STACK_TOP) avec PTE_USER, puis cree un thread
 *                    kernel dont la seule tache est de sauter en ring 3.
 *   int 0x80 / faute revient dans le kernel sur la pile kernel du thread.
 *   process_exit()   repasse sur le repertoire kernel, libere toutes les
 *                    pages du processus et termine le thread. L'entree de
 *                    la table reste EXITED jusqu'a process_wait().
 */
#include <nox/process.h>
#include <nox/paging.h>
#include <nox/pmm.h>
#include <nox/memory.h>
#include <nox/fs.h>
#include <nox/printk.h>
#include <nox/string.h>
#include <nox/io.h>

extern void enter_user_mode(u32 eip, u32 esp) __attribute__((noreturn));

static struct process table[PROC_MAX];
static u32 next_pid = 1;

void process_init(void)
{
    memset(table, 0, sizeof(table));
}

struct process *process_current(void)
{
    return thread_current()->proc;
}

struct process *process_by_pid(u32 pid)
{
    for (int i = 0; i < PROC_MAX; i++)
        if (table[i].state != PROC_FREE && table[i].pid == pid)
            return &table[i];
    return NULL;
}

u32 process_count(void)
{
    u32 n = 0;
    for (int i = 0; i < PROC_MAX; i++)
        if (table[i].state == PROC_RUNNING)
            n++;
    return n;
}

static void process_thread_entry(void *arg)
{
    struct process *p = arg;
    enter_user_mode(p->entry, p->user_stack_top);
}

/* Mappe `pages` frames neuves a partir de `virt` dans `dir`, en copiant
 * `src` (peut etre NULL) dans les premieres. Retourne false si plus de RAM. */
static bool map_region(uintptr_t dir, uintptr_t virt, u32 pages,
                       const u8 *src, u32 src_len)
{
    for (u32 i = 0; i < pages; i++) {
        uintptr_t frame = pmm_alloc_frame();       /* deja mise a zero */
        if (!frame)
            return false;
        if (src && i * PAGE_SIZE < src_len) {
            u32 n = src_len - i * PAGE_SIZE;
            if (n > PAGE_SIZE)
                n = PAGE_SIZE;
            /* la frame est identity-mappee dans l'espace kernel courant */
            memcpy((void *)frame, src + i * PAGE_SIZE, n);
        }
        paging_map_in(dir, virt + i * PAGE_SIZE, frame,
                      PTE_USER | PTE_WRITE);
    }
    return true;
}

int process_spawn(const char *path)
{
    int idx = fs_lookup(path, 0);
    if (idx < 0 || fs_entry(idx)->type != NOXFS_FILE)
        return -1;

    u32 size;
    u8 *image = fs_load(idx, &size);
    if (!image)
        return -2;
    if (size == 0 || size > USER_IMAGE_MAX) {
        kfree(image);
        return -3;
    }

    struct process *p = NULL;
    for (int i = 0; i < PROC_MAX; i++)
        if (table[i].state == PROC_FREE) {
            p = &table[i];
            break;
        }
    if (!p) {
        kfree(image);
        return -4;
    }

    uintptr_t dir = paging_create_directory();
    if (!dir) {
        kfree(image);
        return -5;
    }

    u32 image_pages = (u32)PAGE_ALIGN_UP(size) / PAGE_SIZE;
    u32 stack_pages = USER_STACK_SIZE / PAGE_SIZE;
    bool ok = map_region(dir, USER_BASE, image_pages, image, size) &&
              map_region(dir, USER_STACK_TOP - USER_STACK_SIZE, stack_pages,
                         NULL, 0);
    kfree(image);
    if (!ok) {
        paging_destroy_directory(dir);
        return -6;
    }

    memset(p, 0, sizeof(*p));
    p->state = PROC_RUNNING;
    p->page_dir = dir;
    p->image_size = size;
    p->entry = USER_BASE;
    p->user_stack_top = USER_STACK_TOP;

    const char *base = path;
    for (const char *s = path; *s; s++)
        if (*s == '/' && s[1])
            base = s + 1;
    size_t i = 0;
    while (base[i] && i < PROC_NAME_MAX - 1) {
        p->name[i] = base[i];
        i++;
    }
    p->name[i] = '\0';

    /* Le thread ne doit pas etre ordonnance avant d'avoir son `proc`
     * (schedule() s'en sert pour choisir le CR3). */
    u32 flags = irq_save();
    p->pid = next_pid++;
    p->thread = thread_create(p->name, process_thread_entry, p);
    p->thread->proc = p;
    irq_restore(flags);
    return (int)p->pid;
}

int process_wait(u32 pid)
{
    struct process *p = process_by_pid(pid);
    if (!p)
        return -1;
    while (p->state != PROC_EXITED)
        thread_sleep_ms(5);
    int code = p->exit_code;
    p->state = PROC_FREE;
    return code;
}

bool process_collect(u32 *pid, int *code)
{
    for (int i = 0; i < PROC_MAX; i++)
        if (table[i].state == PROC_EXITED) {
            *pid = table[i].pid;
            *code = table[i].exit_code;
            table[i].state = PROC_FREE;
            return true;
        }
    return false;
}

void process_exit(int code)
{
    cli();
    struct thread *t = thread_current();
    struct process *p = t->proc;
    if (!p)
        panic("process_exit called from kernel thread '%s'", t->name);

    paging_switch(paging_kernel_directory());
    paging_destroy_directory(p->page_dir);
    p->page_dir = 0;
    p->exit_code = code;
    p->state = PROC_EXITED;
    p->thread = NULL;
    t->proc = NULL;
    thread_exit();
}

void process_fault(struct registers *regs, const char *what)
{
    struct process *p = process_current();
    kprintf("\n[proc] %s in pid %u (%s): eip=0x%x err=0x%x cr2=0x%x -> killed\n",
            what, p ? p->pid : 0, p ? p->name : "?",
            regs->eip, regs->err_code, read_cr2());
    process_exit(-1);
}

bool user_range_ok(const void *addr, u32 len)
{
    struct process *p = process_current();
    uintptr_t a = (uintptr_t)addr;
    if (!p || len == 0)
        return len == 0 && p != NULL;
    if (a < USER_BASE || a + len < a || a + len > USER_STACK_TOP)
        return false;
    for (uintptr_t v = PAGE_ALIGN_DOWN(a); v < a + len; v += PAGE_SIZE)
        if (!paging_is_mapped_in(p->page_dir, v))
            return false;
    return true;
}

void process_dump(void)
{
    kprintf("  PID  STATE    PAGES  NAME\n");
    for (int i = 0; i < PROC_MAX; i++) {
        struct process *p = &table[i];
        if (p->state == PROC_FREE)
            continue;
        kprintf("  %-4u %-8s %-6u %s\n", p->pid,
                p->state == PROC_RUNNING ? "running" : "exited",
                (u32)(PAGE_ALIGN_UP(p->image_size) / PAGE_SIZE +
                      USER_STACK_SIZE / PAGE_SIZE),
                p->name);
    }
}
