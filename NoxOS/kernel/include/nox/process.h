/* NoxOS - processus utilisateur (ring 3)
 *
 * Un processus = un espace d'adressage prive + un thread. Le programme est
 * un binaire plat lu depuis NoxFS, charge a USER_BASE et demarre en ring 3
 * a cette meme adresse. Il ne peut toucher que ses propres pages (marquees
 * PTE_USER) et parler au kernel uniquement via int 0x80.
 *
 * Toute faute CPU en ring 3 (page fault, GPF, opcode invalide...) tue le
 * processus, jamais le kernel.
 */
#ifndef NOX_PROCESS_H
#define NOX_PROCESS_H

#include <nox/types.h>
#include <nox/idt.h>
#include <nox/thread.h>

#define PROC_MAX        16
#define PROC_NAME_MAX   32
#define USER_STACK_SIZE (64 * 1024)
#define USER_IMAGE_MAX  (4 * 1024 * 1024)

enum proc_state {
    PROC_FREE,
    PROC_RUNNING,
    PROC_EXITED,        /* fini, en attente d'un process_wait() */
};

struct process {
    u32   pid;
    enum proc_state state;
    char  name[PROC_NAME_MAX];
    uintptr_t page_dir;
    u32   image_size;
    u32   entry;
    u32   user_stack_top;
    int   exit_code;
    struct thread *thread;
};

void process_init(void);
/* Charge `path` depuis NoxFS et demarre un processus. Retourne le pid ou
 * un nombre negatif en cas d'erreur. */
int  process_spawn(const char *path);
/* Bloque jusqu'a la fin du processus `pid`, retourne son code de sortie et
 * libere son entree. -1 si le pid est inconnu. */
int  process_wait(u32 pid);
/* Recupere un processus termine non attendu (lance en arriere-plan) et
 * libere son entree. false s'il n'y en a aucun. */
bool process_collect(u32 *pid, int *code);
struct process *process_current(void);        /* NULL depuis un thread kernel */

/* Proprietaire de la console : seul ce pid peut lire le clavier (SYS_READ).
 * 0 = le shell kernel. Le shell le donne au processus lance au premier plan
 * et le reprend quand celui-ci se termine. */
void console_set_owner(u32 pid);
u32  console_owner(void);
struct process *process_by_pid(u32 pid);
u32  process_count(void);
void process_dump(void);

/* Termine le processus courant (appele depuis un syscall ou une faute).
 * Ne revient jamais. */
void process_exit(int code) __attribute__((noreturn));
/* Faute CPU survenue en ring 3 : affiche un diagnostic et tue le processus. */
void process_fault(struct registers *regs, const char *what) __attribute__((noreturn));

/* Vrai si [addr, addr+len) est entierement dans des pages utilisateur
 * mappees du processus courant. */
bool user_range_ok(const void *addr, u32 len);

#endif
