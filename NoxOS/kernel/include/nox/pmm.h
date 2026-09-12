/* NoxOS - allocateur de pages physiques (Physical Memory Manager)
 *
 * La RAM est decoupee en frames de 4 KiB. Un bitmap indique pour chaque
 * frame si elle est libre (0) ou occupee (1). Seules les frames au-dessus
 * de 1 MiB sont distribuees : tout ce qui est en dessous (BIOS, bootloader,
 * kernel, VGA) reste reserve.
 */
#ifndef NOX_PMM_H
#define NOX_PMM_H

#include <nox/types.h>
#include <nox/memory.h>

#define PAGE_SIZE   4096u
#define PAGE_SHIFT  12
#define PAGE_ALIGN_DOWN(a) ((a) & ~(PAGE_SIZE - 1))
#define PAGE_ALIGN_UP(a)   (((a) + PAGE_SIZE - 1) & ~(PAGE_SIZE - 1))

void      pmm_init(const struct boot_info *info);

/* Retourne l'adresse physique d'une frame libre (mise a zero), ou 0 si plus
 * de memoire. */
uintptr_t pmm_alloc_frame(void);
void      pmm_free_frame(uintptr_t paddr);

u32       pmm_total_frames(void);
u32       pmm_used_frames(void);
u32       pmm_free_frames(void);
uintptr_t pmm_ram_top(void);        /* fin de la RAM utilisable la plus haute */

#endif
