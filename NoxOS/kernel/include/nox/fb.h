/* NoxOS - framebuffer lineaire VBE (mode choisi par le bootloader)
 *
 * fb_init() est appele AVANT la pagination : le framebuffer physique est
 * alors accessible directement. paging_init() l'identity-mappe ensuite
 * grace a fb_phys()/fb_size(). Si le bootloader n'a pas pu passer en mode
 * graphique, fb_active() vaut false et le kernel garde la console VGA texte.
 */
#ifndef NOX_FB_H
#define NOX_FB_H

#include <nox/types.h>
#include <nox/gfx.h>

struct boot_info;

bool fb_init(const struct boot_info *info);
bool fb_active(void);
uintptr_t fb_phys(void);
u32  fb_size(void);                  /* octets, arrondi a la page */
struct surface *fb_surface(void);    /* la surface materielle (ecran) */
int  fb_width(void);
int  fb_height(void);

#endif
