/* NoxOS - allocateur de frames physiques (bitmap) */
#include <nox/pmm.h>
#include <nox/printk.h>
#include <nox/string.h>
#include <nox/io.h>

#define MAX_PHYS        0xFFFFFFFFu
#define MAX_FRAMES      (1u << 20)              /* 4 GiB / 4 KiB */
#define BITMAP_WORDS    (MAX_FRAMES / 32)
#define LOW_RESERVED    0x100000u               /* < 1 MiB : jamais distribue */

static u32 bitmap[BITMAP_WORDS];                /* 128 KiB en .bss */
static u32 total_frames;                        /* frames couvertes par la RAM utilisable */
static u32 used_frames;
static u32 search_hint;                         /* premier mot pouvant contenir un 0 */
static uintptr_t ram_top;

static inline void bit_set(u32 frame)   { bitmap[frame / 32] |=  (1u << (frame % 32)); }
static inline void bit_clear(u32 frame) { bitmap[frame / 32] &= ~(1u << (frame % 32)); }
static inline bool bit_test(u32 frame)  { return (bitmap[frame / 32] >> (frame % 32)) & 1u; }

static u32 popcount(u32 v)
{
    u32 n = 0;
    while (v) {
        v &= v - 1;
        n++;
    }
    return n;
}

static void mark_region(u64 base, u64 length, bool used)
{
    if (base >= MAX_PHYS)
        return;
    u64 end = base + length;
    if (end > (u64)MAX_PHYS + 1)
        end = (u64)MAX_PHYS + 1;

    /* Une zone libre est arrondie vers l'interieur, une zone occupee vers
     * l'exterieur : on ne distribue jamais une frame partiellement reservee. */
    u32 first = used ? (u32)PAGE_ALIGN_DOWN((u32)base) : (u32)PAGE_ALIGN_UP((u32)base);
    u64 last  = used ? PAGE_ALIGN_UP(end) : PAGE_ALIGN_DOWN(end);

    for (u64 a = first; a < last; a += PAGE_SIZE) {
        u32 f = (u32)(a >> PAGE_SHIFT);
        if (used) {
            if (!bit_test(f)) {
                bit_set(f);
                used_frames++;
            }
        } else if (bit_test(f)) {
            bit_clear(f);
            used_frames--;
        }
    }
}

void pmm_init(const struct boot_info *info)
{
    memset(bitmap, 0xFF, sizeof(bitmap));       /* tout reserve par defaut */
    total_frames = 0;
    used_frames  = MAX_FRAMES;
    ram_top      = 0;

    /* 1. Liberer les zones "usable" de la carte E820. */
    for (u32 i = 0; i < info->e820_count; i++) {
        const struct e820_entry *e = &info->e820[i];
        if (e->type != E820_USABLE || e->base >= MAX_PHYS)
            continue;
        u64 end = e->base + e->length;
        if (end > 0xFFFFF000u)
            end = 0xFFFFF000u;
        mark_region(e->base, e->length, false);
        if (end > ram_top)
            ram_top = (uintptr_t)end;
        total_frames += (u32)((PAGE_ALIGN_DOWN((u32)end) - PAGE_ALIGN_UP((u32)e->base)) >> PAGE_SHIFT);
    }

    /* 2. Re-reserver tout ce qui est sous 1 MiB (BIOS, bootloader, kernel). */
    mark_region(0, LOW_RESERVED, true);

    /* used_frames compte aussi tout l'espace non-RAM ; on le ramene a ce qui
     * est reellement occupe dans la RAM utilisable. */
    u32 free = 0;
    for (u32 w = 0; w < BITMAP_WORDS; w++)
        free += popcount(~bitmap[w]);
    total_frames = free;            /* frames vraiment allouables (>= 1 MiB) */
    used_frames  = 0;
    search_hint = LOW_RESERVED >> (PAGE_SHIFT + 5);

    if (free == 0)
        panic("pmm: no usable memory above 1 MiB");
}

uintptr_t pmm_alloc_frame(void)
{
    u32 flags = irq_save();
    for (u32 w = search_hint; w < BITMAP_WORDS; w++) {
        if (bitmap[w] == 0xFFFFFFFFu)
            continue;
        u32 bit = (u32)__builtin_ctz(~bitmap[w]);
        u32 frame = w * 32 + bit;
        bit_set(frame);
        used_frames++;
        search_hint = w;
        irq_restore(flags);

        uintptr_t paddr = (uintptr_t)frame << PAGE_SHIFT;
        memset((void *)paddr, 0, PAGE_SIZE);    /* valide : la RAM est identity-mappee */
        return paddr;
    }
    irq_restore(flags);
    return 0;
}

void pmm_free_frame(uintptr_t paddr)
{
    u32 frame = (u32)(paddr >> PAGE_SHIFT);
    if (paddr < LOW_RESERVED || paddr >= ram_top)
        panic("pmm_free_frame: invalid address 0x%x", paddr);
    u32 flags = irq_save();
    if (!bit_test(frame))
        panic("pmm_free_frame: double free of 0x%x", paddr);
    bit_clear(frame);
    used_frames--;
    if (frame / 32 < search_hint)
        search_hint = frame / 32;
    irq_restore(flags);
}

u32 pmm_total_frames(void) { return total_frames; }
u32 pmm_used_frames(void)  { return used_frames; }
u32 pmm_free_frames(void)  { return total_frames - used_frames; }
uintptr_t pmm_ram_top(void) { return ram_top; }
