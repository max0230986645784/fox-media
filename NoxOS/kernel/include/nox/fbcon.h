/* NoxOS - console texte sur framebuffer (voir gfx/fbcon.c) */
#ifndef NOX_FBCON_H
#define NOX_FBCON_H

#include <nox/types.h>

bool fbcon_init(void);
bool fbcon_active(void);
void fbcon_putc(char c);
void fbcon_clear(void);
void fbcon_set_color(int vga_fg, int vga_bg);   /* couleurs enum vga_color */

#endif
