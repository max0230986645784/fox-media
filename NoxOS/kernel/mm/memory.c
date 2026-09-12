/* NoxOS - carte memoire physique (E820)
 *
 * Copie la carte fournie par le bootloader et calcule la RAM utilisable.
 * L'allocation reelle est faite par pmm.c (frames) et heap.c (tas).
 *
 * Carte memoire basse apres le boot :
 *   0x00000-0x004FF  IVT + BDA (BIOS)
 *   0x07C00-0x08FFF  bootloader (plus utilise apres le saut kernel)
 *   0x09000-0x09FFF  boot_info (E820)
 *   0x10000-_kernel_end  kernel (code + data + bss, dont bitmap PMM et pile)
 *   0x80000-0x9FFFF  EBDA / reserve BIOS
 *   0xA0000-0xFFFFF  memoire video, ROM BIOS
 *   0x100000-...     RAM distribuee par le PMM
 */
#include <nox/memory.h>
#include <nox/printk.h>
#include <nox/string.h>

#define MAX_E820 32

static struct e820_entry mmap[MAX_E820];
static u32 mmap_count;
static u32 total_usable_kb;

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
