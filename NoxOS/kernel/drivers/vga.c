/* NoxOS - pilote texte VGA
 *
 * La carte VGA en mode texte expose une memoire a 0xB8000 : chaque cellule
 * de l'ecran (80x25) est un mot de 16 bits = [attribut couleur][caractere].
 * Le curseur materiel se pilote via les registres CRTC (ports 0x3D4/0x3D5).
 */
#include <nox/vga.h>
#include <nox/io.h>
#include <nox/string.h>

static volatile u16 *const vga_buffer = (volatile u16 *)0xB8000;
static u8  vga_attr;
static u32 cursor_row;
static u32 cursor_col;

static inline u16 vga_entry(char c, u8 attr)
{
    return (u16)c | ((u16)attr << 8);
}

static void update_hw_cursor(void)
{
    u16 pos = (u16)(cursor_row * VGA_WIDTH + cursor_col);
    outb(0x3D4, 0x0F);
    outb(0x3D5, (u8)(pos & 0xFF));
    outb(0x3D4, 0x0E);
    outb(0x3D5, (u8)((pos >> 8) & 0xFF));
}

static void scroll_if_needed(void)
{
    if (cursor_row < VGA_HEIGHT)
        return;

    /* On remonte toutes les lignes d'un cran et on efface la derniere. */
    for (u32 row = 1; row < VGA_HEIGHT; row++) {
        for (u32 col = 0; col < VGA_WIDTH; col++) {
            vga_buffer[(row - 1) * VGA_WIDTH + col] =
                vga_buffer[row * VGA_WIDTH + col];
        }
    }
    for (u32 col = 0; col < VGA_WIDTH; col++)
        vga_buffer[(VGA_HEIGHT - 1) * VGA_WIDTH + col] = vga_entry(' ', vga_attr);

    cursor_row = VGA_HEIGHT - 1;
}

void vga_set_color(enum vga_color fg, enum vga_color bg)
{
    vga_attr = (u8)(fg | (bg << 4));
}

void vga_clear(void)
{
    for (u32 i = 0; i < VGA_WIDTH * VGA_HEIGHT; i++)
        vga_buffer[i] = vga_entry(' ', vga_attr);
    cursor_row = 0;
    cursor_col = 0;
    update_hw_cursor();
}

void vga_init(void)
{
    vga_set_color(VGA_LIGHT_GREY, VGA_BLACK);
    vga_clear();
}

void vga_putc(char c)
{
    switch (c) {
    case '\n':
        cursor_col = 0;
        cursor_row++;
        break;
    case '\r':
        cursor_col = 0;
        break;
    case '\b':
        if (cursor_col > 0) {
            cursor_col--;
            vga_buffer[cursor_row * VGA_WIDTH + cursor_col] = vga_entry(' ', vga_attr);
        }
        break;
    case '\t':
        cursor_col = (cursor_col + 4) & ~3u;
        if (cursor_col >= VGA_WIDTH) {
            cursor_col = 0;
            cursor_row++;
        }
        break;
    default:
        vga_buffer[cursor_row * VGA_WIDTH + cursor_col] = vga_entry(c, vga_attr);
        cursor_col++;
        if (cursor_col >= VGA_WIDTH) {
            cursor_col = 0;
            cursor_row++;
        }
        break;
    }
    scroll_if_needed();
    update_hw_cursor();
}

void vga_puts(const char *s)
{
    while (*s)
        vga_putc(*s++);
}
