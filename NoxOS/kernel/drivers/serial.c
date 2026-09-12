/* NoxOS - pilote UART 16550 (COM1, port 0x3F8)
 *
 * Tout ce que le kernel affiche est aussi envoye sur COM1. Avec
 * `qemu -serial stdio` on recupere ainsi la sortie du kernel dans le
 * terminal, ce qui permet des tests automatiques (voir tests/).
 */
#include <nox/serial.h>
#include <nox/io.h>

#define COM1 0x3F8

static bool serial_ready;

void serial_init(void)
{
    outb(COM1 + 1, 0x00);   /* desactive les interruptions */
    outb(COM1 + 3, 0x80);   /* DLAB = 1 : acces au diviseur de baud */
    outb(COM1 + 0, 0x01);   /* diviseur = 1 -> 115200 bauds (octet bas) */
    outb(COM1 + 1, 0x00);   /*                              (octet haut) */
    outb(COM1 + 3, 0x03);   /* 8 bits, pas de parite, 1 stop bit */
    outb(COM1 + 2, 0xC7);   /* FIFO active, vidage, seuil 14 octets */
    outb(COM1 + 4, 0x0B);   /* IRQ activees, RTS/DSR */

    /* Test en boucle : on ecrit 0xAE et on doit le relire. */
    outb(COM1 + 4, 0x1E);
    outb(COM1 + 0, 0xAE);
    if (inb(COM1 + 0) != 0xAE) {
        serial_ready = false;
        return;
    }
    outb(COM1 + 4, 0x0F);   /* mode normal */
    serial_ready = true;
}

static bool transmit_empty(void)
{
    return (inb(COM1 + 5) & 0x20) != 0;
}

void serial_putc(char c)
{
    if (!serial_ready)
        return;
    if (c == '\n')
        serial_putc('\r');
    while (!transmit_empty())
        ;
    outb(COM1, (u8)c);
}

void serial_puts(const char *s)
{
    while (*s)
        serial_putc(*s++);
}

bool serial_has_char(void)
{
    return serial_ready && (inb(COM1 + 5) & 0x01) != 0;
}

char serial_getc(void)
{
    while (!serial_has_char())
        ;
    return (char)inb(COM1);
}
