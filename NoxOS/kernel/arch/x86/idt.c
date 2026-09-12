/* NoxOS - IDT et dispatcher d'interruptions
 *
 * L'IDT associe chaque numero d'interruption (0..255) a un stub asm.
 *   0..31  : exceptions CPU  -> panic avec le nom de l'exception
 *   32..47 : IRQ materielles -> handler enregistre par un pilote
 */
#include <nox/idt.h>
#include <nox/gdt.h>
#include <nox/pic.h>
#include <nox/printk.h>
#include <nox/string.h>

struct idt_entry {
    u16 base_low;
    u16 selector;
    u8  zero;
    u8  flags;      /* P DPL 0 type(4) : 0x8E = present, ring 0, interrupt gate 32 bits */
    u16 base_high;
} __attribute__((packed));

struct idt_ptr {
    u16 limit;
    u32 base;
} __attribute__((packed));

#define IDT_ENTRIES 256

static struct idt_entry idt[IDT_ENTRIES];
static struct idt_ptr   idt_pointer;
static irq_handler_t    irq_handlers[16];
static irq_handler_t    exception_handlers[32];

static const char *exception_names[32] = {
    "Division by zero", "Debug", "Non-maskable interrupt", "Breakpoint",
    "Overflow", "Bound range exceeded", "Invalid opcode", "Device not available",
    "Double fault", "Coprocessor segment overrun", "Invalid TSS", "Segment not present",
    "Stack-segment fault", "General protection fault", "Page fault", "Reserved",
    "x87 floating-point", "Alignment check", "Machine check", "SIMD floating-point",
    "Virtualization", "Control protection", "Reserved", "Reserved",
    "Reserved", "Reserved", "Reserved", "Reserved",
    "Reserved", "Reserved", "Security exception", "Reserved",
};

/* Stubs definis dans isr.asm */
#define DECL_ISR(n) extern void isr##n(void);
#define DECL_IRQ(n) extern void irq##n(void);
DECL_ISR(0)  DECL_ISR(1)  DECL_ISR(2)  DECL_ISR(3)  DECL_ISR(4)  DECL_ISR(5)
DECL_ISR(6)  DECL_ISR(7)  DECL_ISR(8)  DECL_ISR(9)  DECL_ISR(10) DECL_ISR(11)
DECL_ISR(12) DECL_ISR(13) DECL_ISR(14) DECL_ISR(15) DECL_ISR(16) DECL_ISR(17)
DECL_ISR(18) DECL_ISR(19) DECL_ISR(20) DECL_ISR(21) DECL_ISR(22) DECL_ISR(23)
DECL_ISR(24) DECL_ISR(25) DECL_ISR(26) DECL_ISR(27) DECL_ISR(28) DECL_ISR(29)
DECL_ISR(30) DECL_ISR(31)
DECL_IRQ(0)  DECL_IRQ(1)  DECL_IRQ(2)  DECL_IRQ(3)  DECL_IRQ(4)  DECL_IRQ(5)
DECL_IRQ(6)  DECL_IRQ(7)  DECL_IRQ(8)  DECL_IRQ(9)  DECL_IRQ(10) DECL_IRQ(11)
DECL_IRQ(12) DECL_IRQ(13) DECL_IRQ(14) DECL_IRQ(15)

extern void idt_flush(u32 idt_ptr_addr);

static void idt_set(u8 num, void (*handler)(void), u16 selector, u8 flags)
{
    u32 base = (u32)handler;
    idt[num].base_low  = (u16)(base & 0xFFFF);
    idt[num].base_high = (u16)((base >> 16) & 0xFFFF);
    idt[num].selector  = selector;
    idt[num].zero      = 0;
    idt[num].flags     = flags;
}

void idt_init(void)
{
    memset(idt, 0, sizeof(idt));
    memset(irq_handlers, 0, sizeof(irq_handlers));
    memset(exception_handlers, 0, sizeof(exception_handlers));

    void (*isrs[32])(void) = {
        isr0,  isr1,  isr2,  isr3,  isr4,  isr5,  isr6,  isr7,
        isr8,  isr9,  isr10, isr11, isr12, isr13, isr14, isr15,
        isr16, isr17, isr18, isr19, isr20, isr21, isr22, isr23,
        isr24, isr25, isr26, isr27, isr28, isr29, isr30, isr31,
    };
    void (*irqs[16])(void) = {
        irq0, irq1, irq2,  irq3,  irq4,  irq5,  irq6,  irq7,
        irq8, irq9, irq10, irq11, irq12, irq13, irq14, irq15,
    };

    for (u8 i = 0; i < 32; i++)
        idt_set(i, isrs[i], GDT_KERNEL_CODE, 0x8E);
    for (u8 i = 0; i < 16; i++)
        idt_set((u8)(IRQ_BASE + i), irqs[i], GDT_KERNEL_CODE, 0x8E);

    idt_pointer.limit = sizeof(idt) - 1;
    idt_pointer.base  = (u32)&idt;
    idt_flush((u32)&idt_pointer);
}

void irq_register_handler(u8 irq, irq_handler_t handler)
{
    if (irq < 16)
        irq_handlers[irq] = handler;
}

void isr_register_exception_handler(u8 vector, irq_handler_t handler)
{
    if (vector < 32)
        exception_handlers[vector] = handler;
}

/* Appele par isr_common (isr.asm) pour toute interruption.
 * L'EOI est envoye AVANT le handler : ainsi un handler peut changer de
 * thread (ordonnanceur) sans laisser le PIC bloque en attendant l'EOI. Les
 * interruptions restent coupees (IF=0) jusqu'a l'iret, donc pas de
 * reentrance. */
void isr_dispatch(struct registers *regs)
{
    if (regs->int_no < 32) {
        if (exception_handlers[regs->int_no]) {
            exception_handlers[regs->int_no](regs);
            return;
        }
        panic("%s (int %u, err=0x%x) at eip=0x%x",
              exception_names[regs->int_no], regs->int_no,
              regs->err_code, regs->eip);
    }

    if (regs->int_no >= IRQ_BASE && regs->int_no < IRQ_BASE + 16) {
        u8 irq = (u8)(regs->int_no - IRQ_BASE);
        pic_send_eoi(irq);
        if (irq_handlers[irq])
            irq_handlers[irq](regs);
    }
}
