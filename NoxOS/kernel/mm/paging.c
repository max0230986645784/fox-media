/* NoxOS - pagination
 *
 * Un repertoire de pages (1024 entrees) pointe vers des tables de pages
 * (1024 entrees de 4 KiB chacune). Toutes ces structures sont des frames
 * fournies par le PMM ; comme la RAM est identity-mappee, leur adresse
 * physique est aussi leur adresse virtuelle, ce qui simplifie enormement
 * leur manipulation.
 */
#include <nox/paging.h>
#include <nox/pmm.h>
#include <nox/printk.h>
#include <nox/idt.h>
#include <nox/io.h>
#include <nox/process.h>
#include <nox/string.h>
#include <nox/fb.h>

#define PD_INDEX(v)  (((v) >> 22) & 0x3FF)
#define PT_INDEX(v)  (((v) >> 12) & 0x3FF)
#define ENTRY_ADDR(e) ((e) & ~0xFFFu)

static u32 *page_directory;             /* adresse physique == virtuelle */
static u32  table_count;

static u32 *get_table_in(u32 *dir, uintptr_t virt, bool create, u32 pde_flags)
{
    u32 pde = dir[PD_INDEX(virt)];
    if (pde & PTE_PRESENT)
        return (u32 *)ENTRY_ADDR(pde);
    if (!create)
        return NULL;

    uintptr_t frame = pmm_alloc_frame();
    if (!frame)
        panic("paging: out of memory allocating page table");
    dir[PD_INDEX(virt)] = (u32)frame | PTE_PRESENT | PTE_WRITE | pde_flags;
    table_count++;
    return (u32 *)frame;
}

static u32 *get_table(uintptr_t virt, bool create)
{
    return get_table_in(page_directory, virt, create, 0);
}

void paging_map(uintptr_t virt, uintptr_t phys, u32 flags)
{
    u32 *table = get_table(virt, true);
    u32 *pte = &table[PT_INDEX(virt)];
    if (*pte & PTE_PRESENT)
        panic("paging_map: 0x%x already mapped", virt);
    *pte = (u32)PAGE_ALIGN_DOWN(phys) | (flags & 0xFFFu) | PTE_PRESENT;
    invlpg(virt);
}

uintptr_t paging_unmap(uintptr_t virt)
{
    u32 *table = get_table(virt, false);
    if (!table)
        return 0;
    u32 *pte = &table[PT_INDEX(virt)];
    uintptr_t phys = ENTRY_ADDR(*pte);
    if (!(*pte & PTE_PRESENT))
        return 0;
    *pte = 0;
    invlpg(virt);
    return phys;
}

uintptr_t paging_virt_to_phys(uintptr_t virt)
{
    u32 *table = get_table(virt, false);
    if (!table || !(table[PT_INDEX(virt)] & PTE_PRESENT))
        return 0;
    return ENTRY_ADDR(table[PT_INDEX(virt)]) | (virt & 0xFFFu);
}

bool paging_is_mapped(uintptr_t virt)
{
    u32 *table = get_table(virt, false);
    return table && (table[PT_INDEX(virt)] & PTE_PRESENT);
}

u32 paging_table_count(void)
{
    return table_count;
}

uintptr_t paging_kernel_directory(void)
{
    return (uintptr_t)page_directory;
}

uintptr_t paging_create_directory(void)
{
    u32 *dir = (u32 *)pmm_alloc_frame();
    if (!dir)
        return 0;
    /* Zones kernel : memes tables que le repertoire kernel (partagees). Les
     * tables du tas ont ete pre-allouees a l'init, donc la copie reste
     * valable meme si le tas grandit ensuite. */
    for (u32 i = 0; i < 1024; i++) {
        uintptr_t base = i << 22;
        bool kernel_zone = base < USER_BASE || base >= KHEAP_START;
        if (kernel_zone)
            dir[i] = page_directory[i];
    }
    return (uintptr_t)dir;
}

void paging_map_in(uintptr_t dir, uintptr_t virt, uintptr_t phys, u32 flags)
{
    u32 *table = get_table_in((u32 *)dir, virt, true, PTE_USER);
    u32 *pte = &table[PT_INDEX(virt)];
    if (*pte & PTE_PRESENT)
        panic("paging_map_in: 0x%x already mapped", virt);
    *pte = (u32)PAGE_ALIGN_DOWN(phys) | (flags & 0xFFFu) | PTE_PRESENT;
    if (read_cr3() == dir)
        invlpg(virt);
}

bool paging_is_mapped_in(uintptr_t dir, uintptr_t virt)
{
    u32 *table = get_table_in((u32 *)dir, virt, false, 0);
    return table && (table[PT_INDEX(virt)] & PTE_PRESENT);
}

void paging_destroy_directory(uintptr_t dir)
{
    u32 *d = (u32 *)dir;
    if (d == page_directory)
        panic("paging: refusing to destroy the kernel directory");
    if (read_cr3() == dir)
        paging_switch((uintptr_t)page_directory);

    for (u32 i = PD_INDEX(USER_BASE); i < PD_INDEX(KHEAP_START); i++) {
        if (!(d[i] & PTE_PRESENT))
            continue;
        u32 *table = (u32 *)ENTRY_ADDR(d[i]);
        for (u32 j = 0; j < 1024; j++)
            if (table[j] & PTE_PRESENT)
                pmm_free_frame(ENTRY_ADDR(table[j]));
        pmm_free_frame((uintptr_t)table);
        table_count--;
    }
    pmm_free_frame(dir);
}

void paging_switch(uintptr_t dir)
{
    if (read_cr3() != dir)
        write_cr3(dir);
}

static void page_fault_handler(struct registers *regs)
{
    u32 addr = read_cr2();
    u32 err = regs->err_code;
    if ((regs->cs & 3) == 3)
        process_fault(regs, "Page fault");
    panic("page fault at 0x%x (%s, %s, %s) eip=0x%x",
          addr,
          (err & 1) ? "protection" : "not present",
          (err & 2) ? "write" : "read",
          (err & 4) ? "user" : "kernel",
          regs->eip);
}

void paging_init(void)
{
    page_directory = (u32 *)pmm_alloc_frame();
    if (!page_directory)
        panic("paging: cannot allocate page directory");
    table_count = 0;

    /* Identity mapping de toute la RAM : le kernel, la pile, la VGA (0xB8000),
     * le PMM et les tables de pages continuent de fonctionner sans changement
     * d'adresse. */
    uintptr_t top = PAGE_ALIGN_UP(pmm_ram_top());
    for (uintptr_t a = 0; a < top; a += PAGE_SIZE)
        paging_map(a, a, PTE_WRITE);

    /* Tables du tas kernel allouees des maintenant pour que tous les
     * repertoires de processus puissent les partager (voir
     * paging_create_directory). 64 tables = 256 Ko. */
    for (uintptr_t a = KHEAP_START; a < KHEAP_END; a += 1u << 22)
        get_table(a, true);

    /* Framebuffer VBE (hors RAM, typiquement 0xFD000000) : identity-mappe
     * avant d'activer la pagination pour que la console reste visible. */
    if (fb_active())
        for (uintptr_t a = fb_phys(); a < fb_phys() + fb_size(); a += PAGE_SIZE)
            paging_map(a, a, PTE_WRITE);

    isr_register_exception_handler(14, page_fault_handler);

    write_cr3((u32)page_directory);
    write_cr0(read_cr0() | 0x80000000u);    /* CR0.PG */
}
