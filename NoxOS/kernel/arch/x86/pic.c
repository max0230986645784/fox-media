/* NoxOS - PIC 8259A
 *
 * Le PC possede deux PIC en cascade (maitre : IRQ 0-7, esclave : IRQ 8-15).
 * Par defaut le BIOS mappe les IRQ sur les interruptions 8..15, ce qui entre
 * en conflit avec les exceptions CPU. On les remappe sur 32..47.
 */
#include <nox/pic.h>
#include <nox/io.h>
#include <nox/idt.h>

#define PIC1_CMD  0x20
#define PIC1_DATA 0x21
#define PIC2_CMD  0xA0
#define PIC2_DATA 0xA1

#define ICW1_INIT 0x10
#define ICW1_ICW4 0x01
#define ICW4_8086 0x01
#define PIC_EOI   0x20

void pic_init(void)
{
    /* ICW1 : debut d'initialisation */
    outb(PIC1_CMD, ICW1_INIT | ICW1_ICW4);
    io_wait();
    outb(PIC2_CMD, ICW1_INIT | ICW1_ICW4);
    io_wait();

    /* ICW2 : vecteur de base */
    outb(PIC1_DATA, IRQ_BASE);
    io_wait();
    outb(PIC2_DATA, IRQ_BASE + 8);
    io_wait();

    /* ICW3 : cablage maitre/esclave (esclave sur IRQ2) */
    outb(PIC1_DATA, 0x04);
    io_wait();
    outb(PIC2_DATA, 0x02);
    io_wait();

    /* ICW4 : mode 8086 */
    outb(PIC1_DATA, ICW4_8086);
    io_wait();
    outb(PIC2_DATA, ICW4_8086);
    io_wait();

    /* Tout masque sauf la cascade (IRQ2) : les pilotes demasquent ce qu'ils utilisent. */
    outb(PIC1_DATA, 0xFB);
    outb(PIC2_DATA, 0xFF);
}

void pic_send_eoi(u8 irq)
{
    if (irq >= 8)
        outb(PIC2_CMD, PIC_EOI);
    outb(PIC1_CMD, PIC_EOI);
}

void pic_mask(u8 irq)
{
    u16 port = irq < 8 ? PIC1_DATA : PIC2_DATA;
    u8 bit = (u8)(irq & 7);
    outb(port, inb(port) | (u8)(1 << bit));
}

void pic_unmask(u8 irq)
{
    u16 port = irq < 8 ? PIC1_DATA : PIC2_DATA;
    u8 bit = (u8)(irq & 7);
    outb(port, inb(port) & (u8)~(1 << bit));
}
