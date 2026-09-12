/* NoxOS - threads kernel et ordonnanceur preemptif (round-robin)
 *
 * v0.2 : tous les threads tournent en ring 0 et partagent l'espace
 * d'adressage kernel. Les processus utilisateur (ring 3, espace prive)
 * viendront avec les appels systeme en v0.3.
 */
#ifndef NOX_THREAD_H
#define NOX_THREAD_H

#include <nox/types.h>

#define THREAD_NAME_MAX   16
#define THREAD_STACK_SIZE (16 * 1024)
#define SCHED_SLICE_TICKS 2               /* 20 ms a 100 Hz */

enum thread_state {
    THREAD_READY,
    THREAD_RUNNING,
    THREAD_SLEEPING,
    THREAD_ZOMBIE,
};

typedef void (*thread_fn)(void *arg);

struct thread {
    u32   esp;                      /* DOIT rester le premier champ (switch.asm) */
    u32   id;
    enum thread_state state;
    char  name[THREAD_NAME_MAX];
    thread_fn entry;
    void *arg;
    u8   *stack;                    /* NULL pour le thread principal */
    u32   wake_tick;
    u32   run_ticks;                /* temps CPU consomme */
    struct thread *next;            /* liste circulaire de tous les threads */
};

void           sched_init(void);            /* transforme kmain en thread "main" */
struct thread *thread_create(const char *name, thread_fn fn, void *arg);
struct thread *thread_current(void);
void           thread_yield(void);
void           thread_sleep_ms(u32 ms);
void           thread_exit(void) __attribute__((noreturn));
u32            thread_count(void);
void           sched_tick(void);            /* appele par l'IRQ timer */
void           sched_dump(void);            /* commande shell `ps` */

#endif
