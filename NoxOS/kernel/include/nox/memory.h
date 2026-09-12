/* NoxOS - carte memoire E820 et tas kernel */
#ifndef NOX_MEMORY_H
#define NOX_MEMORY_H

#include <nox/types.h>

/* Entree E820 telle que fournie par le BIOS (via le bootloader). */
struct e820_entry {
    u64 base;
    u64 length;
    u32 type;       /* 1 = utilisable, 2 = reservee, 3/4 = ACPI, 5 = defectueuse */
    u32 acpi_attr;
} __attribute__((packed));

/* Structure remplie par boot/stage2.asm a l'adresse 0x9000. */
struct boot_info {
    u32 e820_count;
    u32 boot_drive;
    u32 kernel_sectors;
    u32 reserved;
    struct e820_entry e820[];
} __attribute__((packed));

#define E820_USABLE 1

/* Carte memoire (kernel/mm/memory.c) */
void memory_init(const struct boot_info *info);
void memory_print_map(void);
u32  memory_total_usable_kb(void);

/* Tas kernel (kernel/mm/heap.c) : liste chainee de blocs libres dans la zone
 * virtuelle KHEAP_START..KHEAP_END, agrandie page par page a la demande. */
void   heap_init(void);
void  *kmalloc(size_t size);
void  *kmalloc_aligned(size_t size, size_t align);
void   kfree(void *ptr);
u32    heap_used_bytes(void);
u32    heap_mapped_bytes(void);
bool   heap_check(void);       /* verifie l'integrite de la liste des blocs */

#endif
