/* NoxOS - kprintf : formatage minimal vers VGA et port serie */
#include <nox/printk.h>
#include <nox/vga.h>
#include <nox/serial.h>
#include <nox/string.h>
#include <nox/io.h>
#include <nox/keyboard.h>

char console_getc(void)
{
    char c;
    for (;;) {
        if (keyboard_poll(&c))
            return c;
        if (serial_has_char()) {
            c = serial_getc();
            return c == '\r' ? '\n' : c;
        }
        hlt();
    }
}

typedef __builtin_va_list va_list;
#define va_start(ap, last) __builtin_va_start(ap, last)
#define va_arg(ap, type)   __builtin_va_arg(ap, type)
#define va_end(ap)         __builtin_va_end(ap)

void kputc(char c)
{
    vga_putc(c);
    serial_putc(c);
}

void kputs(const char *s)
{
    while (*s)
        kputc(*s++);
}

static void put_padded(const char *s, int width, char pad, bool left)
{
    int len = (int)strlen(s);
    if (left) {
        kputs(s);
        pad = ' ';
    }
    while (len < width) {
        kputc(pad);
        len++;
    }
    if (!left)
        kputs(s);
}

static void vkprintf(const char *fmt, va_list ap)
{
    char buf[34];

    for (; *fmt; fmt++) {
        if (*fmt != '%') {
            kputc(*fmt);
            continue;
        }
        fmt++;

        char pad = ' ';
        int width = 0;
        bool left = false;
        if (*fmt == '-') {
            left = true;
            fmt++;
        }
        if (*fmt == '0') {
            pad = '0';
            fmt++;
        }
        while (*fmt >= '0' && *fmt <= '9') {
            width = width * 10 + (*fmt - '0');
            fmt++;
        }

        switch (*fmt) {
        case 's': {
            const char *s = va_arg(ap, const char *);
            put_padded(s ? s : "(null)", width, ' ', left);
            break;
        }
        case 'c':
            kputc((char)va_arg(ap, int));
            break;
        case 'd':
            itoa(va_arg(ap, i32), buf);
            put_padded(buf, width, pad, left);
            break;
        case 'u':
            utoa(va_arg(ap, u32), buf, 10);
            put_padded(buf, width, pad, left);
            break;
        case 'x':
            utoa(va_arg(ap, u32), buf, 16);
            put_padded(buf, width, pad, left);
            break;
        case 'p':
            kputs("0x");
            utoa((u32)va_arg(ap, void *), buf, 16);
            put_padded(buf, 8, '0', false);
            break;
        case '%':
            kputc('%');
            break;
        case '\0':
            return;
        default:
            kputc('%');
            kputc(*fmt);
            break;
        }
    }
}

void kprintf(const char *fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    vkprintf(fmt, ap);
    va_end(ap);
}

void panic(const char *fmt, ...)
{
    cli();
    vga_set_color(VGA_WHITE, VGA_RED);
    kputs("\n*** KERNEL PANIC *** ");
    va_list ap;
    va_start(ap, fmt);
    vkprintf(fmt, ap);
    va_end(ap);
    kputs("\nSystem halted.\n");
    for (;;)
        hlt();
}
