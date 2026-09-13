/* NoxOS - threads kernel + ordonnanceur round-robin preemptif
 *
 * Tous les threads sont dans une liste circulaire. Le timer (IRQ 0) appelle
 * sched_tick() a chaque tick ; quand le quantum du thread courant est
 * ecoule, schedule() choisit le thread READY suivant et bascule dessus
 * via switch_context (arch/x86/switch.asm).
 *
 * Un thread neuf recoit une pile preparee "comme si" switch_context venait
 * d'y sauver un contexte : 4 registres a zero puis l'adresse de
 * thread_trampoline. Au premier switch, `ret` saute donc dans le trampoline
 * qui reactive les interruptions et appelle la fonction du thread.
 */
#include <nox/thread.h>
#include <nox/memory.h>
#include <nox/printk.h>
#include <nox/string.h>
#include <nox/timer.h>
#include <nox/io.h>
#include <nox/gdt.h>
#include <nox/paging.h>
#include <nox/process.h>

extern void switch_context(struct thread *prev, struct thread *next);

static struct thread  main_thread;
static struct thread *current;
static struct thread *idle_thread;
static u32 next_id = 1;
static u32 nthreads;
static u32 slice_left;

static void idle_loop(void *arg)
{
    (void)arg;
    for (;;)
        hlt();
}

static void thread_trampoline(void)
{
    struct thread *t = current;
    sti();
    t->entry(t->arg);
    thread_exit();
}

static void list_insert(struct thread *t)
{
    /* insertion juste apres current : liste circulaire */
    t->next = current->next;
    current->next = t;
    nthreads++;
}

static void reap_zombies(void)
{
    struct thread *prev = current;
    struct thread *t = current->next;
    while (t != current) {
        struct thread *n = t->next;
        if (t->state == THREAD_ZOMBIE) {
            prev->next = n;
            nthreads--;
            kfree(t->stack);
            kfree(t);
        } else {
            prev = t;
        }
        t = n;
    }
}

static void wake_sleepers(u32 now)
{
    struct thread *t = current;
    do {
        if (t->state == THREAD_SLEEPING && (i32)(now - t->wake_tick) >= 0)
            t->state = THREAD_READY;
        t = t->next;
    } while (t != current);
}

/* Choisit le prochain thread pret (round-robin), idle en dernier recours. */
static struct thread *pick_next(void)
{
    struct thread *t = current->next;
    while (t != current) {
        if (t->state == THREAD_READY && t != idle_thread)
            return t;
        t = t->next;
    }
    if (current->state == THREAD_RUNNING || current->state == THREAD_READY)
        return current;
    return idle_thread;
}

/* Interruptions coupees a l'appel. */
static void schedule(void)
{
    reap_zombies();
    struct thread *next = pick_next();
    slice_left = SCHED_SLICE_TICKS;

    if (next == current) {
        current->state = THREAD_RUNNING;
        return;
    }

    struct thread *prev = current;
    if (prev->state == THREAD_RUNNING)
        prev->state = THREAD_READY;
    next->state = THREAD_RUNNING;
    current = next;
    /* Pile kernel utilisee par le CPU quand `next` (en ring 3) sera
     * interrompu, et espace d'adressage de son processus. */
    tss_set_kernel_stack(next->kstack_top);
    paging_switch(next->proc ? next->proc->page_dir : paging_kernel_directory());
    switch_context(prev, next);
}

void sched_init(void)
{
    memset(&main_thread, 0, sizeof(main_thread));
    main_thread.id = next_id++;
    main_thread.state = THREAD_RUNNING;
    strcpy(main_thread.name, "main");
    main_thread.next = &main_thread;
    current = &main_thread;
    nthreads = 1;
    slice_left = SCHED_SLICE_TICKS;

    idle_thread = thread_create("idle", idle_loop, NULL);
}

struct thread *thread_create(const char *name, thread_fn fn, void *arg)
{
    struct thread *t = kmalloc(sizeof(*t));
    memset(t, 0, sizeof(*t));
    t->stack = kmalloc(THREAD_STACK_SIZE);
    t->kstack_top = (u32)(t->stack + THREAD_STACK_SIZE);
    t->entry = fn;
    t->arg   = arg;
    t->state = THREAD_READY;

    size_t i = 0;
    while (name[i] && i < THREAD_NAME_MAX - 1) {
        t->name[i] = name[i];
        i++;
    }
    t->name[i] = '\0';

    /* Pile initiale : [edi esi ebx ebp] = 0, puis adresse de retour. */
    u32 *sp = (u32 *)(t->stack + THREAD_STACK_SIZE);
    *--sp = (u32)thread_trampoline;
    *--sp = 0;                          /* ebp */
    *--sp = 0;                          /* ebx */
    *--sp = 0;                          /* esi */
    *--sp = 0;                          /* edi */
    t->esp = (u32)sp;

    u32 flags = irq_save();
    t->id = next_id++;
    list_insert(t);
    irq_restore(flags);
    return t;
}

struct thread *thread_current(void)
{
    return current;
}

void thread_yield(void)
{
    u32 flags = irq_save();
    schedule();
    irq_restore(flags);
}

void thread_sleep_ms(u32 ms)
{
    /* borne : au-dela de ~24 jours on plafonne (evite le debordement 32 bits) */
    if (ms > 0x7FFFFFFFu / TIMER_HZ)
        ms = 0x7FFFFFFFu / TIMER_HZ;
    u32 ticks = (ms * TIMER_HZ + 999) / 1000;
    u32 flags = irq_save();
    current->wake_tick = timer_ticks() + (ticks ? ticks : 1);
    current->state = THREAD_SLEEPING;
    schedule();
    irq_restore(flags);
}

void thread_exit(void)
{
    cli();
    if (current == &main_thread)
        panic("thread_exit: main thread cannot exit");
    current->state = THREAD_ZOMBIE;
    schedule();
    panic("thread_exit: zombie thread resumed");
}

u32 thread_count(void)
{
    return nthreads;
}

void sched_tick(void)
{
    if (!current)
        return;
    current->run_ticks++;
    wake_sleepers(timer_ticks());
    if (slice_left > 0)
        slice_left--;
    if (slice_left == 0 || current == idle_thread)
        schedule();
}

void sched_dump(void)
{
    static const char *state_names[] = { "ready", "running", "sleeping", "zombie" };
    u32 flags = irq_save();
    kprintf("  ID  STATE     CPU(ms)  RING PID  NAME\n");
    struct thread *t = current;
    do {
        kprintf("  %-3u %-9s %-8u %-4u %-4u %s\n", t->id, state_names[t->state],
                t->run_ticks * (1000 / TIMER_HZ), t->proc ? 3 : 0,
                t->proc ? t->proc->pid : 0, t->name);
        t = t->next;
    } while (t != current);
    irq_restore(flags);
}
