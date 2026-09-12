/* NoxOS - point d'entree C du kernel
 *
 * Ordre d'initialisation (chaque etape depend de la precedente) :
 *   1. serie + VGA      -> pouvoir afficher quelque chose (et paniquer proprement)
 *   2. GDT              -> segments du kernel (independance du bootloader)
 *   3. IDT + PIC        -> pouvoir recevoir exceptions et IRQ
 *   4. memoire          -> carte E820, frames physiques (PMM), pagination, tas
 *   5. pilotes          -> timer (IRQ0), clavier (IRQ1)
 *   6. ordonnanceur     -> kmain devient le thread "main"
 *   7. sti              -> interruptions autorisees, preemption active
 *   8. shell
 */
#include <nox/types.h>
#include <nox/printk.h>
#include <nox/vga.h>
#include <nox/serial.h>
#include <nox/gdt.h>
#include <nox/idt.h>
#include <nox/pic.h>
#include <nox/memory.h>
#include <nox/pmm.h>
#include <nox/paging.h>
#include <nox/thread.h>
#include <nox/timer.h>
#include <nox/keyboard.h>
#include <nox/cpu.h>
#include <nox/shell.h>
#include <nox/io.h>

extern u8 _kernel_start[];
extern u8 _kernel_end[];

static void print_banner(void)
{
    vga_set_color(VGA_LIGHT_CYAN, VGA_BLACK);
    kprintf("\n  %s v%s\n", KERNEL_NAME, KERNEL_VERSION);
    vga_set_color(VGA_DARK_GREY, VGA_BLACK);
    kprintf("  NoxOS - Built from scratch.\n\n");
    vga_set_color(VGA_LIGHT_GREY, VGA_BLACK);
}

static void step(const char *what)
{
    kprintf("[init] %s\n", what);
}

void kmain(u32 magic, const struct boot_info *info)
{
    serial_init();
    vga_init();
    print_banner();

    if (magic != NOX_BOOT_MAGIC)
        panic("bad boot magic 0x%x (expected 0x%x)", magic, NOX_BOOT_MAGIC);

    step("gdt");
    gdt_init();

    step("idt + pic");
    pic_init();
    idt_init();

    step("memory");
    memory_init(info);
    kprintf("       kernel: 0x%x - 0x%x (%u KB), usable RAM: %u MB, E820 entries: %u\n",
            (u32)_kernel_start, (u32)_kernel_end,
            ((u32)_kernel_end - (u32)_kernel_start) / 1024,
            memory_total_usable_kb() / 1024, info ? info->e820_count : 0);

    step("pmm");
    pmm_init(info);
    kprintf("       %u frames of 4 KB, %u free\n", pmm_total_frames(), pmm_free_frames());

    step("paging");
    paging_init();
    kprintf("       identity map 0 - 0x%x, %u page tables\n", pmm_ram_top(), paging_table_count());

    step("heap");
    heap_init();
    kprintf("       virtual heap at 0x%x, %u KB mapped\n", KHEAP_START, heap_mapped_bytes() / 1024);

    step("timer");
    timer_init();

    step("keyboard");
    keyboard_init();

    step("scheduler");
    sched_init();

    sti();

    struct cpu_info cpu;
    cpu_detect(&cpu);
    kprintf("       cpu: %s\n", cpu.brand);

    vga_set_color(VGA_LIGHT_GREEN, VGA_BLACK);
    kprintf("\nSystem initialized successfully.\n\n");
    vga_set_color(VGA_LIGHT_GREY, VGA_BLACK);

    shell_run();
}
