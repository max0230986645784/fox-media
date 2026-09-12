/* NoxOS - gestion memoire v0.1
 *
 * 1. Lecture de la carte memoire E820 transmise par le bootloader pour
 *    savoir combien de RAM est reellement utilisable.
 * 2. Un allocateur "bump" tres simple pour le kernel : on avance un
 *    pointeur dans une zone libre situee juste apres le kernel. Il n'y a
 *    pas de liberation : c'est suffisant pour v0.1 et remplace par un vrai
 *    allocateur (pages + tas) en v0.2.
 *
 * Carte memoire basse apres le boot :
 *   0x00000-0x004FF  IVT + BDA (BIOS)
 *   0x07C00-0x08FFF  bootloader (plus utilise apres le saut kernel)
 *   0x09000-0x09FFF  boot_info (E820)
 *   0x10000-_kernel_end  kernel (code + data + bss)
 *   _kernel_end-0x80000  tas kernel (cet allocateur)
 *   0x80000-0x9FFFF  EBDA / reserve BIOS
 *   0xA0000-0xFFFFF  memoire video, ROM BIOS
 */
#include <nox/memory.h>
#include <nox/printk.h>
#include <nox/string.h>

extern u8 _kernel_start[];
extern u8 _kernel_end[];

#define HEAP_END 0x80000u
#define MAX_E820 32

static struct e820_entry mmap[MAX_E820];
static u32 mmap_count;
static u32 total_usable_kb;

static uintptr_t heap_start;
static uintptr_t heap_ptr;

static const char *e820_type_name(u32 type)
{
    switch (type) {
    case 1:  return "usable";
    case 2:  return "reserved";
    case 3:  return "ACPI reclaim";
    case 4:  return "ACPI NVS";
    case 5:  return "bad";
    default: return "unknown";
    }
}

void memory_init(const struct boot_info *info)
{
    mmap_count = 0;
    total_usable_kb = 0;

    if (info && info->e820_count > 0) {
        u32 n = info->e820_count;
        if (n > MAX_E820)
            n = MAX_E820;
        memcpy(mmap, info->e820, n * sizeof(struct e820_entry));
        mmap_count = n;
    }

    for (u32 i = 0; i < mmap_count; i++) {
        if (mmap[i].type == E820_USABLE)
            total_usable_kb += (u32)(mmap[i].length / 1024);
    }

    heap_start = ((uintptr_t)_kernel_end + 15) & ~15u;
    heap_ptr = heap_start;

    if (heap_start >= HEAP_END)
        panic("kernel too large: no room for heap below 0x%x", HEAP_END);
}

void memory_print_map(void)
{
    if (mmap_count == 0) {
        kprintf("  (no E820 memory map provided by bootloader)\n");
        return;
    }
    for (u32 i = 0; i < mmap_count; i++) {
        u32 base_hi = (u32)(mmap[i].base >> 32);
        u32 base_lo = (u32)mmap[i].base;
        u32 len_kb  = (u32)(mmap[i].length / 1024);
        kprintf("  %08x%08x  %8u KB  %s\n", base_hi, base_lo, len_kb,
                e820_type_name(mmap[i].type));
    }
}

u32 memory_total_usable_kb(void)
{
    return total_usable_kb;
}

u32 memory_heap_used(void)
{
    return (u32)(heap_ptr - heap_start);
}

u32 memory_heap_size(void)
{
    return (u32)(HEAP_END - heap_start);
}

void *kmalloc_aligned(size_t size, size_t align)
{
    uintptr_t aligned = (heap_ptr + (align - 1)) & ~(align - 1);
    if (aligned + size > HEAP_END || aligned + size < aligned)
        panic("kmalloc: out of memory (requested %u bytes)", size);
    heap_ptr = aligned + size;
    return (void *)aligned;
}

void *kmalloc(size_t size)
{
    return kmalloc_aligned(size, 16);
}
