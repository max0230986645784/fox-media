/* NoxOS - memoire physique et allocateur kernel de base */
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

void memory_init(const struct boot_info *info);
void memory_print_map(void);

u32  memory_total_usable_kb(void);
u32  memory_heap_used(void);
u32  memory_heap_size(void);

/* Allocation kernel simple (bump allocator, pas de free en v0.1). */
void *kmalloc(size_t size);
void *kmalloc_aligned(size_t size, size_t align);

#endif
