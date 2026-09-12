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

#define PD_INDEX(v)  (((v) >> 22) & 0x3FF)
#define PT_INDEX(v)  (((v) >> 12) & 0x3FF)
#define ENTRY_ADDR(e) ((e) & ~0xFFFu)

static u32 *page_directory;             /* adresse physique == virtuelle */
static u32  table_count;

static u32 *get_table(uintptr_t virt, bool create)
{
    u32 pde = page_directory[PD_INDEX(virt)];
    if (pde & PTE_PRESENT)
        return (u32 *)ENTRY_ADDR(pde);
    if (!create)
        return NULL;

    uintptr_t frame = pmm_alloc_frame();
    if (!frame)
        panic("paging: out of memory allocating page table");
    page_directory[PD_INDEX(virt)] = (u32)frame | PTE_PRESENT | PTE_WRITE;
    table_count++;
    return (u32 *)frame;
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

static void page_fault_handler(struct registers *regs)
{
    u32 addr = read_cr2();
    u32 err = regs->err_code;
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

    isr_register_exception_handler(14, page_fault_handler);

    write_cr3((u32)page_directory);
    write_cr0(read_cr0() | 0x80000000u);    /* CR0.PG */
}
