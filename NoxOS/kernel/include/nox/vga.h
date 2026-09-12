/* NoxOS - pilote texte VGA (mode 80x25, memoire video a 0xB8000) */
#ifndef NOX_VGA_H
#define NOX_VGA_H

#include <nox/types.h>

enum vga_color {
    VGA_BLACK = 0,  VGA_BLUE,       VGA_GREEN,       VGA_CYAN,
    VGA_RED,        VGA_MAGENTA,    VGA_BROWN,       VGA_LIGHT_GREY,
    VGA_DARK_GREY,  VGA_LIGHT_BLUE, VGA_LIGHT_GREEN, VGA_LIGHT_CYAN,
    VGA_LIGHT_RED,  VGA_PINK,       VGA_YELLOW,      VGA_WHITE,
};

#define VGA_WIDTH  80
#define VGA_HEIGHT 25

void vga_init(void);
void vga_clear(void);
void vga_set_color(enum vga_color fg, enum vga_color bg);
void vga_putc(char c);
void vga_puts(const char *s);

#endif
