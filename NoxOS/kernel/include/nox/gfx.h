/* NoxOS - primitives graphiques 2D sur surfaces 32 bpp (0xAARRGGBB)
 *
 * Une surface est un tableau de pixels en memoire : soit le framebuffer
 * materiel (drivers/fb.c), soit un tampon alloue par kmalloc (double
 * buffering du bureau, contenu des fenetres). Toutes les fonctions clippent
 * sur les bords de la surface : dessiner hors champ est sans danger.
 */
#ifndef NOX_GFX_H
#define NOX_GFX_H

#include <nox/types.h>

struct surface {
    u32 *pixels;
    int  w, h;
    int  pitch;          /* en pixels (u32), pas en octets */
};

struct rect { int x, y, w, h; };

#define RGB(r, g, b)     (0xFF000000u | ((u32)(r) << 16) | ((u32)(g) << 8) | (u32)(b))
#define RGBA(r, g, b, a) (((u32)(a) << 24) | ((u32)(r) << 16) | ((u32)(g) << 8) | (u32)(b))

#define FONT_W 8
#define FONT_H 16
extern const u8 font8x16[256][16];

static inline bool rect_intersect(struct rect a, struct rect b, struct rect *out)
{
    int x0 = a.x > b.x ? a.x : b.x;
    int y0 = a.y > b.y ? a.y : b.y;
    int x1 = (a.x + a.w < b.x + b.w) ? a.x + a.w : b.x + b.w;
    int y1 = (a.y + a.h < b.y + b.h) ? a.y + a.h : b.y + b.h;
    if (x1 <= x0 || y1 <= y0)
        return false;
    out->x = x0; out->y = y0; out->w = x1 - x0; out->h = y1 - y0;
    return true;
}

static inline bool rect_contains(struct rect r, int x, int y)
{
    return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

struct surface *surface_create(int w, int h);          /* kmalloc, pixels a 0 */
void            surface_destroy(struct surface *s);

void gfx_fill(struct surface *s, struct rect r, u32 color);
/* Remplissage avec alpha (color & 0xFF000000 = opacite) */
void gfx_fill_alpha(struct surface *s, struct rect r, u32 color);
void gfx_fill_rounded(struct surface *s, struct rect r, int radius, u32 color);
void gfx_hline(struct surface *s, int x, int y, int w, u32 color);
void gfx_vline(struct surface *s, int x, int y, int h, u32 color);
void gfx_rect(struct surface *s, struct rect r, u32 color);      /* contour 1 px */
void gfx_gradient_v(struct surface *s, struct rect r, u32 top, u32 bottom);

/* Copie src (entier) sur dst en (x, y), pixels alpha melanges si blend. */
void gfx_blit(struct surface *dst, int x, int y, const struct surface *src, bool blend);
/* Copie une sous-zone de src (srect) vers dst en (x, y), sans alpha. */
void gfx_copy(struct surface *dst, int x, int y, const struct surface *src, struct rect srect);
/* Image RGBA brute w*h (fichiers .rgba de NoxFS), avec alpha. */
void gfx_draw_rgba(struct surface *s, int x, int y, int w, int h, const u32 *rgba);
/* Redimensionnement plus proche voisin d'une image RGBA. */
void gfx_draw_rgba_scaled(struct surface *s, int x, int y, int dw, int dh,
                          int sw, int sh, const u32 *rgba);

void gfx_char(struct surface *s, int x, int y, char c, u32 fg);   /* fond transparent */
void gfx_text(struct surface *s, int x, int y, const char *str, u32 fg);
int  gfx_text_width(const char *str);

#endif
