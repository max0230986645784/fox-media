/* NoxOS - pagination x86 (32 bits, pages de 4 KiB, 2 niveaux)
 *
 * Espace d'adressage (v0.3) :
 *   0x00000000 - ram_top      identity mapping de toute la RAM (kernel seul)
 *   0x40000000 - ...          image d'un processus utilisateur (code+data+bss)
 *   ...        - 0x80000000   pile utilisateur (juste sous USER_STACK_TOP)
 *   0xD0000000 - 0xDFFFFFFF   tas kernel (frames mappees a la demande)
 *
 * Chaque processus possede son propre repertoire de pages. Les entrees du
 * repertoire couvrant les zones kernel sont COPIEES depuis le repertoire
 * kernel (elles pointent vers les memes tables, allouees une fois pour
 * toutes a l'init), les zones utilisateur sont privees.
 */
#ifndef NOX_PAGING_H
#define NOX_PAGING_H

#include <nox/types.h>

#define PTE_PRESENT   0x001u
#define PTE_WRITE     0x002u
#define PTE_USER      0x004u

#define KHEAP_START     0xD0000000u
#define KHEAP_END       0xE0000000u
#define USER_BASE       0x40000000u
#define USER_STACK_TOP  0x80000000u

void      paging_init(void);
/* Associe une page virtuelle a une frame physique. Alloue la table de pages
 * si necessaire. Panique si la page est deja mappee. */
void      paging_map(uintptr_t virt, uintptr_t phys, u32 flags);
/* Retire un mappage et renvoie l'adresse physique qu'il visait (0 si aucun). */
uintptr_t paging_unmap(uintptr_t virt);
uintptr_t paging_virt_to_phys(uintptr_t virt);   /* 0 si non mappe */
bool      paging_is_mapped(uintptr_t virt);
u32       paging_table_count(void);              /* tables de pages allouees */

/* Repertoires de pages par processus (adresses physiques == virtuelles). */
uintptr_t paging_kernel_directory(void);
uintptr_t paging_create_directory(void);         /* copie des zones kernel */
void      paging_map_in(uintptr_t dir, uintptr_t virt, uintptr_t phys, u32 flags);
bool      paging_is_mapped_in(uintptr_t dir, uintptr_t virt);
/* Libere toutes les pages et tables utilisateur puis le repertoire. */
void      paging_destroy_directory(uintptr_t dir);
void      paging_switch(uintptr_t dir);           /* charge CR3 si different */

#endif
