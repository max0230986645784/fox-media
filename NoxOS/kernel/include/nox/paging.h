/* NoxOS - pagination x86 (32 bits, pages de 4 KiB, 2 niveaux)
 *
 * Espace d'adressage kernel (v0.2) :
 *   0x00000000 - ram_top      identity mapping de toute la RAM physique
 *   0xD0000000 - 0xDFFFFFFF   tas kernel (frames mappees a la demande)
 */
#ifndef NOX_PAGING_H
#define NOX_PAGING_H

#include <nox/types.h>

#define PTE_PRESENT   0x001u
#define PTE_WRITE     0x002u
#define PTE_USER      0x004u

#define KHEAP_START   0xD0000000u
#define KHEAP_END     0xE0000000u

void      paging_init(void);
/* Associe une page virtuelle a une frame physique. Alloue la table de pages
 * si necessaire. Panique si la page est deja mappee. */
void      paging_map(uintptr_t virt, uintptr_t phys, u32 flags);
/* Retire un mappage et renvoie l'adresse physique qu'il visait (0 si aucun). */
uintptr_t paging_unmap(uintptr_t virt);
uintptr_t paging_virt_to_phys(uintptr_t virt);   /* 0 si non mappe */
bool      paging_is_mapped(uintptr_t virt);
u32       paging_table_count(void);              /* tables de pages allouees */

#endif
