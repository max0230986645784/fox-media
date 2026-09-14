/* NoxOS - kprintf : formatage minimal vers VGA et port serie */
#include <nox/printk.h>
#include <nox/vga.h>
#include <nox/serial.h>
#include <nox/string.h>
#include <nox/io.h>
#include <nox/keyboard.h>
#include <nox/fbcon.h>

static void (*console_sink)(char);

void console_set_sink(void (*sink)(char)) { console_sink = sink; }

void console_set_color(int fg, int bg)
{
    if (fbcon_active())
        fbcon_set_color(fg, bg);
    else
        vga_set_color((enum vga_color)fg, (enum vga_color)bg);
}

void console_clear(void)
{
    if (fbcon_active())
        fbcon_clear();
    else
        vga_clear();
}

#define INJECT_SIZE 128
static char inject_buf[INJECT_SIZE];
static u32  inject_head, inject_tail;
static bool keyboard_grabbed;

void console_inject(char c)
{
    u32 next = (inject_head + 1) % INJECT_SIZE;
    if (next == inject_tail)
        return;
    inject_buf[inject_head] = c;
    inject_head = next;
}

void console_grab_keyboard(bool grabbed) { keyboard_grabbed = grabbed; }

char console_getc(void)
{
    char c;
    for (;;) {
        if (inject_head != inject_tail) {
            c = inject_buf[inject_tail];
            inject_tail = (inject_tail + 1) % INJECT_SIZE;
            return c;
        }
        if (!keyboard_grabbed && keyboard_poll(&c))
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
    if (console_sink)
        console_sink(c);
    else if (fbcon_active())
        fbcon_putc(c);
    else
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
    console_set_color(VGA_WHITE, VGA_RED);
    kputs("\n*** KERNEL PANIC *** ");
    va_list ap;
    va_start(ap, fmt);
    vkprintf(fmt, ap);
    va_end(ap);
    kputs("\nSystem halted.\n");
    for (;;)
        hlt();
}
