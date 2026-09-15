/* NoxOS - console texte sur framebuffer
 *
 * Remplace la console VGA 80x25 quand le bootloader a active un mode
 * graphique : meme role (messages d'init, shell kernel), rendu avec la
 * police 8x16 directement sur la surface ecran. Le bureau (Nox Desktop)
 * prend ensuite la main et redirige la sortie kernel vers sa fenetre
 * terminal via console_set_sink().
 */
#include <nox/fbcon.h>
#include <nox/fb.h>
#include <nox/string.h>

static struct surface *scr;
static int cols, rows, col, row;
static u32 fg = 0xFFC8C8C8, bg = 0xFF101418;
static bool ready;

static const u32 vga_palette[16] = {
    0xFF000000, 0xFF0000AA, 0xFF00AA00, 0xFF00AAAA, 0xFFAA0000, 0xFFAA00AA,
    0xFFAA5500, 0xFFAAAAAA, 0xFF555555, 0xFF5555FF, 0xFF55FF55, 0xFF55FFFF,
    0xFFFF5555, 0xFFFF55FF, 0xFFFFFF55, 0xFFFFFFFF,
};

bool fbcon_init(void)
{
    scr = fb_surface();
    if (!scr)
        return false;
    cols = scr->w / FONT_W;
    rows = scr->h / FONT_H;
    col = row = 0;
    gfx_fill(scr, (struct rect){ 0, 0, scr->w, scr->h }, bg);
    ready = true;
    return true;
}

bool fbcon_active(void) { return ready; }

void fbcon_set_color(int vga_fg, int vga_bg)
{
    fg = vga_palette[vga_fg & 15];
    if (vga_bg)
        bg = vga_palette[vga_bg & 15];
}

static void scroll(void)
{
    u32 line = (u32)scr->pitch * FONT_H;
    memmove(scr->pixels, scr->pixels + line,
            (u32)(rows - 1) * line * 4u);
    gfx_fill(scr, (struct rect){ 0, (rows - 1) * FONT_H, scr->w, scr->h - (rows - 1) * FONT_H }, bg);
    row = rows - 1;
}

static void cell(int c, int r, char ch)
{
    struct rect cr = { c * FONT_W, r * FONT_H, FONT_W, FONT_H };
    gfx_fill(scr, cr, bg);
    if (ch != ' ')
        gfx_char(scr, cr.x, cr.y, ch, fg);
}

void fbcon_putc(char c)
{
    if (!ready)
        return;
    switch (c) {
    case '\n': col = 0; row++; break;
    case '\r': col = 0; break;
    case '\b':
        if (col > 0) { col--; cell(col, row, ' '); }
        break;
    case '\t':
        col = (col + 4) & ~3;
        if (col >= cols) { col = 0; row++; }
        break;
    default:
        cell(col, row, c);
        if (++col >= cols) { col = 0; row++; }
        break;
    }
    if (row >= rows)
        scroll();
}

void fbcon_clear(void)
{
    if (!ready)
        return;
    gfx_fill(scr, (struct rect){ 0, 0, scr->w, scr->h }, bg);
    col = row = 0;
}
