/* NoxOS - Interrupt Descriptor Table et gestion des interruptions */
#ifndef NOX_IDT_H
#define NOX_IDT_H

#include <nox/types.h>

/* Etat CPU sauvegarde par les stubs de kernel/arch/x86/isr.asm */
struct registers {
    u32 ds;
    u32 edi, esi, ebp, esp_dummy, ebx, edx, ecx, eax;  /* pusha */
    u32 int_no, err_code;
    u32 eip, cs, eflags;                               /* pousses par le CPU */
    u32 useresp, ss;             /* seulement si l'interruption vient du ring 3 */
} __attribute__((packed));

#define SYSCALL_VECTOR 0x80

typedef void (*irq_handler_t)(struct registers *regs);

#define IRQ_BASE 32           /* les IRQ materielles sont mappees sur 32..47 */
#define IRQ_TIMER    0
#define IRQ_KEYBOARD 1

void idt_init(void);
void irq_register_handler(u8 irq, irq_handler_t handler);
void isr_register_exception_handler(u8 vector, irq_handler_t handler);

#endif
