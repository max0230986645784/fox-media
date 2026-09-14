/* NoxOS - primitives graphiques 2D (voir include/nox/gfx.h) */
#include <nox/gfx.h>
#include <nox/memory.h>
#include <nox/string.h>

struct surface *surface_create(int w, int h)
{
    if (w <= 0 || h <= 0)
        return NULL;
    struct surface *s = kmalloc(sizeof(*s));
    if (!s)
        return NULL;
    s->pixels = kmalloc((u32)w * (u32)h * 4u);
    if (!s->pixels) {
        kfree(s);
        return NULL;
    }
    memset(s->pixels, 0, (u32)w * (u32)h * 4u);
    s->w = w; s->h = h; s->pitch = w;
    return s;
}

void surface_destroy(struct surface *s)
{
    if (!s)
        return;
    kfree(s->pixels);
    kfree(s);
}

struct surface *surface_from_nxi(const void *data, u32 size)
{
    const u32 *hdr = data;
    if (!data || size < 16 || hdr[0] != NXI_MAGIC || hdr[3] != 16)
        return NULL;
    u32 w = hdr[1], h = hdr[2];
    if (w == 0 || h == 0 || w > 4096 || h > 4096 || size < 16 + w * h * 2)
        return NULL;
    struct surface *s = surface_create((int)w, (int)h);
    if (!s)
        return NULL;
    const u16 *px = (const u16 *)((const u8 *)data + 16);
    u32 n = w * h;
    for (u32 i = 0; i < n; i++) {
        u16 p = px[i];
        u32 r = (p >> 11) & 0x1F, g = (p >> 5) & 0x3F, b = p & 0x1F;
        s->pixels[i] = RGB((r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2));
    }
    return s;
}

static inline bool clip(const struct surface *s, struct rect *r)
{
    struct rect bounds = { 0, 0, s->w, s->h };
    return rect_intersect(*r, bounds, r);
}

static inline u32 blend(u32 dst, u32 src)
{
    u32 a = src >> 24;
    if (a == 255) return src | 0xFF000000u;
    if (a == 0)   return dst;
    u32 ia = 255 - a;
    u32 r = (((src >> 16) & 0xFF) * a + ((dst >> 16) & 0xFF) * ia) / 255;
    u32 g = (((src >> 8)  & 0xFF) * a + ((dst >> 8)  & 0xFF) * ia) / 255;
    u32 b = (( src        & 0xFF) * a + ( dst        & 0xFF) * ia) / 255;
    return 0xFF000000u | (r << 16) | (g << 8) | b;
}

void gfx_fill(struct surface *s, struct rect r, u32 color)
{
    if (!clip(s, &r))
        return;
    for (int y = 0; y < r.h; y++) {
        u32 *p = s->pixels + (r.y + y) * s->pitch + r.x;
        for (int x = 0; x < r.w; x++)
            p[x] = color;
    }
}

void gfx_fill_alpha(struct surface *s, struct rect r, u32 color)
{
    if ((color >> 24) == 255) { gfx_fill(s, r, color); return; }
    if (!clip(s, &r))
        return;
    for (int y = 0; y < r.h; y++) {
        u32 *p = s->pixels + (r.y + y) * s->pitch + r.x;
        for (int x = 0; x < r.w; x++)
            p[x] = blend(p[x], color);
    }
}

void gfx_fill_rounded(struct surface *s, struct rect r, int radius, u32 color)
{
    if (radius <= 0) { gfx_fill_alpha(s, r, color); return; }
    if (radius * 2 > r.w) radius = r.w / 2;
    if (radius * 2 > r.h) radius = r.h / 2;
    /* corps + bandes, puis coins par test de distance */
    gfx_fill_alpha(s, (struct rect){ r.x + radius, r.y, r.w - 2 * radius, r.h }, color);
    gfx_fill_alpha(s, (struct rect){ r.x, r.y + radius, radius, r.h - 2 * radius }, color);
    gfx_fill_alpha(s, (struct rect){ r.x + r.w - radius, r.y + radius, radius, r.h - 2 * radius }, color);
    int rr = radius * radius;
    for (int dy = 0; dy < radius; dy++) {
        for (int dx = 0; dx < radius; dx++) {
            int cx = radius - 1 - dx, cy = radius - 1 - dy;
            /* centre du pixel a (cx+0.5, cy+0.5) */
            int d4 = (2 * cx + 1) * (2 * cx + 1) + (2 * cy + 1) * (2 * cy + 1);
            if (d4 > 4 * rr)
                continue;
            gfx_fill_alpha(s, (struct rect){ r.x + dx, r.y + dy, 1, 1 }, color);
            gfx_fill_alpha(s, (struct rect){ r.x + r.w - 1 - dx, r.y + dy, 1, 1 }, color);
            gfx_fill_alpha(s, (struct rect){ r.x + dx, r.y + r.h - 1 - dy, 1, 1 }, color);
            gfx_fill_alpha(s, (struct rect){ r.x + r.w - 1 - dx, r.y + r.h - 1 - dy, 1, 1 }, color);
        }
    }
}

void gfx_hline(struct surface *s, int x, int y, int w, u32 color)
{
    gfx_fill_alpha(s, (struct rect){ x, y, w, 1 }, color);
}

void gfx_vline(struct surface *s, int x, int y, int h, u32 color)
{
    gfx_fill_alpha(s, (struct rect){ x, y, 1, h }, color);
}

void gfx_rect(struct surface *s, struct rect r, u32 color)
{
    gfx_hline(s, r.x, r.y, r.w, color);
    gfx_hline(s, r.x, r.y + r.h - 1, r.w, color);
    gfx_vline(s, r.x, r.y + 1, r.h - 2, color);
    gfx_vline(s, r.x + r.w - 1, r.y + 1, r.h - 2, color);
}

void gfx_gradient_v(struct surface *s, struct rect r, u32 top, u32 bottom)
{
    if (r.h <= 0)
        return;
    for (int y = 0; y < r.h; y++) {
        u32 t = (u32)y * 255u / (u32)(r.h > 1 ? r.h - 1 : 1);
        u32 c = 0xFF000000u;
        for (int sh = 0; sh < 24; sh += 8) {
            u32 a = (top >> sh) & 0xFF, b = (bottom >> sh) & 0xFF;
            c |= ((a * (255 - t) + b * t) / 255) << sh;
        }
        gfx_fill(s, (struct rect){ r.x, r.y + y, r.w, 1 }, c);
    }
}

void gfx_copy(struct surface *dst, int x, int y, const struct surface *src, struct rect sr)
{
    struct rect sb = { 0, 0, src->w, src->h };
    if (!rect_intersect(sr, sb, &sr))
        return;
    struct rect d = { x, y, sr.w, sr.h };
    struct rect dc = d;
    if (!clip(dst, &dc))
        return;
    int ox = dc.x - d.x, oy = dc.y - d.y;
    for (int row = 0; row < dc.h; row++)
        memcpy(dst->pixels + (dc.y + row) * dst->pitch + dc.x,
               src->pixels + (sr.y + oy + row) * src->pitch + sr.x + ox,
               (u32)dc.w * 4u);
}

void gfx_blit(struct surface *dst, int x, int y, const struct surface *src, bool do_blend)
{
    if (!do_blend) {
        gfx_copy(dst, x, y, src, (struct rect){ 0, 0, src->w, src->h });
        return;
    }
    gfx_draw_rgba(dst, x, y, src->w, src->h, src->pixels);
}

void gfx_draw_rgba(struct surface *s, int x, int y, int w, int h, const u32 *rgba)
{
    struct rect d = { x, y, w, h }, dc = d;
    if (!clip(s, &dc))
        return;
    int ox = dc.x - d.x, oy = dc.y - d.y;
    for (int row = 0; row < dc.h; row++) {
        u32 *p = s->pixels + (dc.y + row) * s->pitch + dc.x;
        const u32 *q = rgba + (oy + row) * w + ox;
        for (int col = 0; col < dc.w; col++)
            p[col] = blend(p[col], q[col]);
    }
}

void gfx_draw_rgba_scaled(struct surface *s, int x, int y, int dw, int dh,
                          int sw, int sh, const u32 *rgba)
{
    if (dw <= 0 || dh <= 0 || sw <= 0 || sh <= 0)
        return;
    struct rect d = { x, y, dw, dh }, dc = d;
    if (!clip(s, &dc))
        return;
    for (int row = 0; row < dc.h; row++) {
        int sy = (dc.y + row - d.y) * sh / dh;
        u32 *p = s->pixels + (dc.y + row) * s->pitch + dc.x;
        for (int col = 0; col < dc.w; col++) {
            int sx = (dc.x + col - d.x) * sw / dw;
            p[col] = blend(p[col], rgba[sy * sw + sx]);
        }
    }
}

void gfx_char(struct surface *s, int x, int y, char c, u32 fg)
{
    const u8 *g = font8x16[(u8)c];
    struct rect d = { x, y, FONT_W, FONT_H }, dc = d;
    if (!clip(s, &dc))
        return;
    for (int row = dc.y - d.y; row < dc.y - d.y + dc.h; row++) {
        u8 bits = g[row];
        if (!bits)
            continue;
        u32 *p = s->pixels + (y + row) * s->pitch;
        for (int col = dc.x - d.x; col < dc.x - d.x + dc.w; col++)
            if (bits & (0x80 >> col))
                p[x + col] = blend(p[x + col], fg);
    }
}

void gfx_text(struct surface *s, int x, int y, const char *str, u32 fg)
{
    for (; *str; str++, x += FONT_W)
        gfx_char(s, x, y, *str, fg);
}

int gfx_text_width(const char *str)
{
    return (int)strlen(str) * FONT_W;
}
