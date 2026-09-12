/* NoxOS - GDT du kernel
 *
 * Le bootloader a installe une GDT temporaire dans sa propre memoire
 * (0x7E00). Le kernel en installe une a lui pour ne plus dependre du
 * bootloader. Modele memoire "plat" : code et data couvrent 0..4 Go.
 * Les segments utilisateur (ring 3) sont deja prevus pour les versions
 * futures mais ne sont pas encore utilises.
 */
#include <nox/gdt.h>

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

#define GDT_ENTRIES 5

static struct gdt_entry gdt[GDT_ENTRIES];
static struct gdt_ptr   gdt_pointer;

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
    gdt_set(3, 0, 0xFFFFF, 0xFA, 0xC0);        /* 0x18 user code (futur) */
    gdt_set(4, 0, 0xFFFFF, 0xF2, 0xC0);        /* 0x20 user data (futur) */

    gdt_pointer.limit = sizeof(gdt) - 1;
    gdt_pointer.base  = (u32)&gdt;
    gdt_flush((u32)&gdt_pointer);
}
