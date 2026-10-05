/* NoxOS - console texte sur framebuffer (voir gfx/fbcon.c) */
#ifndef NOX_FBCON_H
#define NOX_FBCON_H

#include <nox/types.h>

bool fbcon_init(void);
bool fbcon_active(void);
void fbcon_putc(char c);
void fbcon_clear(void);
/* console cachee : les messages restent sur le port serie, l'ecran n'est
 * pas touche (ecran de demarrage). fbcon_show() la reaffiche (panic, shell). */
void fbcon_hide(void);
void fbcon_show(void);
void fbcon_set_color(int vga_fg, int vga_bg);   /* couleurs enum vga_color */

#endif
