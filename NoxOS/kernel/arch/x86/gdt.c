/* NoxOS - GDT du kernel + TSS
 *
 * Le bootloader a installe une GDT temporaire dans sa propre memoire
 * (0x7E00). Le kernel en installe une a lui pour ne plus dependre du
 * bootloader. Modele memoire "plat" : code et data couvrent 0..4 Go.
 *
 * Le TSS (Task State Segment) n'est pas utilise pour le multitache
 * materiel : le CPU s'en sert uniquement pour trouver la pile kernel
 * (ss0:esp0) quand une interruption ou un `int 0x80` survient pendant
 * que le processeur est en ring 3.
 */
#include <nox/gdt.h>
#include <nox/string.h>

struct gdt_entry {
    u16 limit_low;
    u16 base_low;
    u8  base_mid;
    u8  access;
    u8  granularity;   /* flags (4 bits) + limite 16..19 (4 bits) */
    u8  base_high;
} __attribute__((packed));

struct gdt_ptr {
    u16 limit;
    u32 base;
} __attribute__((packed));

struct tss {
    u32 prev_task;
    u32 esp0, ss0;
    u32 esp1, ss1;
    u32 esp2, ss2;
    u32 cr3, eip, eflags;
    u32 eax, ecx, edx, ebx, esp, ebp, esi, edi;
    u32 es, cs, ss, ds, fs, gs;
    u32 ldt;
    u16 trap, iomap_base;
} __attribute__((packed));

#define GDT_ENTRIES 6

static struct gdt_entry gdt[GDT_ENTRIES];
static struct gdt_ptr   gdt_pointer;
static struct tss       tss;

extern void gdt_flush(u32 gdt_ptr_addr);

static void gdt_set(int idx, u32 base, u32 limit, u8 access, u8 flags)
{
    gdt[idx].base_low    = (u16)(base & 0xFFFF);
    gdt[idx].base_mid    = (u8)((base >> 16) & 0xFF);
    gdt[idx].base_high   = (u8)((base >> 24) & 0xFF);
    gdt[idx].limit_low   = (u16)(limit & 0xFFFF);
    gdt[idx].granularity = (u8)(((limit >> 16) & 0x0F) | (flags & 0xF0));
    gdt[idx].access      = access;
}

void gdt_init(void)
{
    /* access : P=1 DPL S type ; flags : G=1 (4K) D=1 (32 bits) */
    gdt_set(0, 0, 0, 0, 0);                    /* nul */
    gdt_set(1, 0, 0xFFFFF, 0x9A, 0xC0);        /* 0x08 kernel code */
    gdt_set(2, 0, 0xFFFFF, 0x92, 0xC0);        /* 0x10 kernel data */
    gdt_set(3, 0, 0xFFFFF, 0xFA, 0xC0);        /* 0x18 user code (DPL 3) */
    gdt_set(4, 0, 0xFFFFF, 0xF2, 0xC0);        /* 0x20 user data (DPL 3) */

    memset(&tss, 0, sizeof(tss));
    tss.ss0 = GDT_KERNEL_DATA;
    tss.iomap_base = sizeof(tss);              /* pas de bitmap d'E/S */
    /* 0x89 = present, DPL 0, TSS 32 bits disponible ; granularite octet */
    gdt_set(5, (u32)&tss, sizeof(tss) - 1, 0x89, 0x00);

    gdt_pointer.limit = sizeof(gdt) - 1;
    gdt_pointer.base  = (u32)&gdt;
    gdt_flush((u32)&gdt_pointer);

    __asm__ volatile ("ltr %%ax" : : "a"((u16)GDT_TSS));
}

void tss_set_kernel_stack(u32 esp0)
{
    tss.esp0 = esp0;
}
