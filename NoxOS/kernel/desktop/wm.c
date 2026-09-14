/* NoxOS - Nox Desktop : fenetres, compositeur, barre des taches, menu
 *
 * Boucle du thread "desktop" (desktop_thread) :
 *   1. lire les evenements souris/clavier et les router (barre, menu, fenetre
 *      sous le curseur / fenetre active, deplacement de fenetre en cours) ;
 *   2. envoyer WM_TICK aux fenetres ~2 fois/s (horloge, gestionnaire) ;
 *   3. si quelque chose a change, recomposer : fond -> fenetres (ordre Z) ->
 *      barre des taches -> menu -> curseur, dans un backbuffer, puis copie
 *      d'un bloc vers le framebuffer (pas de scintillement).
 *
 * Style : barre des taches "pilule" centree (maquette utilisateur), fenetres
 * a coins arrondis avec pastilles de fermeture a gauche, horloge a droite.
 */
#include <nox/wm.h>
#include <nox/desktop.h>
#include <nox/lang.h>
#include <nox/fb.h>
#include <nox/mouse.h>
#include <nox/keyboard.h>
#include <nox/thread.h>
#include <nox/timer.h>
#include <nox/rtc.h>
#include <nox/fs.h>
#include <nox/memory.h>
#include <nox/printk.h>
#include <nox/string.h>
#include <nox/io.h>

#define TASKBAR_H     64
#define DOCK_H        56
#define DOCK_ICON     40
#define DOCK_PAD      8
#define MENU_W        300
#define DBLCLICK_MS   400

static struct surface *screen, *back, *wallpaper;
static struct window  *windows;             /* tete = arriere-plan */
static struct window  *focused;
static bool running, need_redraw;
static struct desktop_settings settings = { false, false, true, 0, true };

static u32 *logo_px;
static int  logo_size;

/* deplacement de fenetre */
static struct window *drag_win;
static int drag_dx, drag_dy;
/* double clic */
static u32 last_click_tick;
static int last_click_x, last_click_y;
/* menu */
static bool menu_open;
static struct rect menu_rect;
/* barre des taches : zones cliquables calculees au dessin */
struct dock_item { struct rect r; enum app_icon icon; struct window *win; };
static struct dock_item dock_items[24];
static int dock_count;
static struct rect dock_rect;
static int hover_x = -1, hover_y = -1;

/* --------------------------------------------------------------------------
 * Fenetres
 * ------------------------------------------------------------------------ */
struct window *wm_create(const char *title, int x, int y, int w, int h,
                         enum app_icon icon, wm_paint_fn paint, wm_event_fn event,
                         void *data)
{
    struct window *win = kmalloc(sizeof(*win));
    if (!win)
        return NULL;
    memset(win, 0, sizeof(*win));
    win->content = surface_create(w, h - WM_TITLE_H);
    if (!win->content) {
        kfree(win);
        return NULL;
    }
    win->frame = (struct rect){ x, y, w, h };
    strncpy(win->title, title, WM_TITLE_MAX - 1);
    win->icon = icon; win->paint = paint; win->event = event; win->data = data;
    win->dirty = true;

    /* insertion en queue = premier plan */
    if (!windows) {
        windows = win;
    } else {
        struct window *t = windows;
        while (t->next) t = t->next;
        t->next = win;
    }
    focused = win;
    need_redraw = true;
    return win;
}

void wm_destroy(struct window *w)
{
    if (!w)
        return;
    struct wm_event ev = { .type = WM_CLOSE };
    if (w->event)
        w->event(w, &ev);
    if (windows == w) {
        windows = w->next;
    } else {
        for (struct window *t = windows; t; t = t->next)
            if (t->next == w) { t->next = w->next; break; }
    }
    if (focused == w) {
        focused = windows;
        while (focused && focused->next) focused = focused->next;
    }
    if (drag_win == w)
        drag_win = NULL;
    surface_destroy(w->content);
    kfree(w);
    need_redraw = true;
}

void wm_focus(struct window *w)
{
    if (!w || w == focused)
        return;
    /* retirer puis remettre en queue */
    if (windows == w) {
        windows = w->next;
    } else {
        for (struct window *t = windows; t; t = t->next)
            if (t->next == w) { t->next = w->next; break; }
    }
    w->next = NULL;
    if (!windows) {
        windows = w;
    } else {
        struct window *t = windows;
        while (t->next) t = t->next;
        t->next = w;
    }
    focused = w;
    need_redraw = true;
}

void wm_invalidate(struct window *w)
{
    if (w) w->dirty = true;
    need_redraw = true;
}

void wm_set_title(struct window *w, const char *title)
{
    strncpy(w->title, title, WM_TITLE_MAX - 1);
    w->title[WM_TITLE_MAX - 1] = '\0';
    need_redraw = true;
}

struct window *wm_focused(void) { return focused; }
struct window *wm_first(void)   { return windows; }
int wm_screen_w(void) { return screen ? screen->w : 0; }
int wm_screen_h(void) { return screen ? screen->h : 0; }

struct window *wm_find_icon(enum app_icon icon)
{
    for (struct window *t = windows; t; t = t->next)
        if (t->icon == icon && !t->popup)
            return t;
    return NULL;
}

struct rect wm_workarea(void)
{
    struct rect r = { 0, 0, screen->w, screen->h - TASKBAR_H };
    if (settings.taskbar_top)
        r.y = TASKBAR_H;
    return r;
}

const u32 *wm_logo(int *size)
{
    if (size) *size = logo_size;
    return logo_px;
}

/* --------------------------------------------------------------------------
 * Icones vectorielles
 * ------------------------------------------------------------------------ */
void wm_draw_icon(struct surface *s, int x, int y, int sz, enum app_icon icon)
{
    int r = sz / 5;
    struct rect box = { x, y, sz, sz };
    if (icon == ICON_NOX) {
        if (logo_px)
            gfx_draw_rgba_scaled(s, x, y, sz, sz, logo_size, logo_size, logo_px);
        else {
            gfx_fill_rounded(s, box, r, RGB(40, 44, 60));
            gfx_text(s, x + sz / 2 - FONT_W, y + sz / 2 - FONT_H / 2, "N", C_TEXT_LIGHT);
        }
        return;
    }
    if (icon == ICON_EXPLORER || icon == ICON_FOLDER || icon == ICON_HOME ||
        icon == ICON_IMAGE || icon == ICON_MUSIC || icon == ICON_VIDEO || icon == ICON_DOWNLOAD) {
        /* dossier : languette + corps */
        u32 back = RGB(232, 168, 48), front = RGB(250, 200, 80);
        if (icon == ICON_IMAGE)    { back = RGB(80, 150, 90);   front = RGB(120, 200, 130); }
        if (icon == ICON_MUSIC)    { back = RGB(180, 80, 140);  front = RGB(220, 120, 180); }
        if (icon == ICON_VIDEO)    { back = RGB(80, 100, 190);  front = RGB(120, 140, 230); }
        if (icon == ICON_DOWNLOAD) { back = RGB(70, 150, 170);  front = RGB(110, 190, 210); }
        if (icon == ICON_HOME)     { back = RGB(90, 130, 200);  front = RGB(130, 170, 240); }
        gfx_fill_rounded(s, (struct rect){ x, y + sz / 5, sz / 2, sz / 6 }, 2, back);
        gfx_fill_rounded(s, (struct rect){ x, y + sz / 4, sz, sz * 3 / 5 }, 3, back);
        gfx_fill_rounded(s, (struct rect){ x, y + sz * 2 / 5, sz, sz * 9 / 20 }, 3, front);
        return;
    }
    switch (icon) {
    case ICON_TERMINAL:
        gfx_fill_rounded(s, box, r, RGB(32, 34, 44));
        gfx_rect(s, box, RGBA(255, 255, 255, 40));
        gfx_text(s, x + sz / 6, y + sz / 2 - FONT_H / 2, ">_", RGB(120, 240, 140));
        break;
    case ICON_SETTINGS: {
        gfx_fill_rounded(s, box, r, RGB(120, 126, 140));
        int cx = x + sz / 2, cy = y + sz / 2, rr = sz * 3 / 10;
        for (int i = 0; i < 8; i++) {
            /* dents : 8 petits carres autour du cercle */
            static const int dx[8] = { 0, 7, 10, 7, 0, -7, -10, -7 };
            static const int dy[8] = { -10, -7, 0, 7, 10, 7, 0, -7 };
            int px = cx + dx[i] * rr / 10, py = cy + dy[i] * rr / 10;
            gfx_fill(s, (struct rect){ px - sz / 12, py - sz / 12, sz / 6, sz / 6 }, RGB(240, 240, 245));
        }
        gfx_fill_rounded(s, (struct rect){ cx - rr * 3 / 4, cy - rr * 3 / 4, rr * 3 / 2, rr * 3 / 2 }, rr * 3 / 4, RGB(240, 240, 245));
        gfx_fill_rounded(s, (struct rect){ cx - rr / 3, cy - rr / 3, rr * 2 / 3, rr * 2 / 3 }, rr / 3, RGB(120, 126, 140));
        break;
    }
    case ICON_TASKMGR:
        gfx_fill_rounded(s, box, r, RGB(60, 110, 200));
        gfx_fill(s, (struct rect){ x + sz / 6, y + sz / 2, sz / 6, sz / 3 }, RGB(240, 240, 245));
        gfx_fill(s, (struct rect){ x + sz * 5 / 12, y + sz / 4, sz / 6, sz * 7 / 12 }, RGB(240, 240, 245));
        gfx_fill(s, (struct rect){ x + sz * 2 / 3, y + sz * 3 / 8, sz / 6, sz * 11 / 24 }, RGB(240, 240, 245));
        break;
    case ICON_TEXT:
    case ICON_FILE:
        gfx_fill_rounded(s, (struct rect){ x + sz / 8, y, sz * 3 / 4, sz }, 3, RGB(250, 250, 252));
        gfx_rect(s, (struct rect){ x + sz / 8, y, sz * 3 / 4, sz }, RGBA(0, 0, 0, 60));
        for (int i = 0; i < 4; i++)
            gfx_fill(s, (struct rect){ x + sz / 4, y + sz / 4 + i * sz / 6, sz / 2, 2 }, RGB(150, 155, 170));
        break;
    case ICON_INFO:
        gfx_fill_rounded(s, box, sz / 2, C_ACCENT);
        gfx_text(s, x + sz / 2 - FONT_W / 2, y + sz / 2 - FONT_H / 2, "i", C_TEXT_LIGHT);
        break;
    case ICON_POWER:
        gfx_fill_rounded(s, box, sz / 2, RGB(210, 70, 70));
        gfx_fill_rounded(s, (struct rect){ x + sz / 4, y + sz / 4, sz / 2, sz / 2 }, sz / 4, RGB(250, 250, 252));
        gfx_fill_rounded(s, (struct rect){ x + sz / 4 + 3, y + sz / 4 + 3, sz / 2 - 6, sz / 2 - 6 }, sz / 4, RGB(210, 70, 70));
        gfx_fill(s, (struct rect){ x + sz / 2 - 1, y + sz / 5, 3, sz / 3 }, RGB(250, 250, 252));
        break;
    default:
        gfx_fill_rounded(s, box, r, RGB(120, 120, 130));
        break;
    }
}

void wm_draw_button(struct surface *s, struct rect r, const char *label, bool active)
{
    gfx_fill_rounded(s, r, 6, active ? C_ACCENT : RGB(218, 221, 230));
    int tw = gfx_text_width(label);
    gfx_text(s, r.x + (r.w - tw) / 2, r.y + (r.h - FONT_H) / 2, label,
             active ? C_TEXT_LIGHT : C_TEXT);
}

/* --------------------------------------------------------------------------
 * Composition
 * ------------------------------------------------------------------------ */
/* Fonds d'ecran : images /sys/wallpapers/<nom>.nxi fournies par l'utilisateur.
 * Si l'image manque (pas de disque), un fond procedural du meme ton est
 * dessine a la place. */
static const char *const wallpaper_files[WALLPAPER_COUNT] = {
    "/sys/wallpapers/nox.nxi", "/sys/wallpapers/neon.nxi", "/sys/wallpapers/anime.nxi",
};

static struct surface *load_wallpaper_image(int index)
{
    if (!fs_mounted() || index < 0 || index >= WALLPAPER_COUNT)
        return NULL;
    int idx = fs_lookup(wallpaper_files[index], 0);
    if (idx < 0)
        return NULL;
    u32 size;
    void *data = fs_load(idx, &size);
    if (!data)
        return NULL;
    struct surface *img = surface_from_nxi(data, size);
    kfree(data);
    return img;
}

/* Dessine l'image mise a l'echelle (plus proche voisin) dans r. */
static void draw_image_scaled(struct surface *s, struct rect r, const struct surface *img)
{
    for (int y = 0; y < r.h; y++) {
        int sy = y * img->h / r.h;
        for (int x = 0; x < r.w; x++) {
            int sx = x * img->w / r.w;
            gfx_fill(s, (struct rect){ r.x + x, r.y + y, 1, 1 }, img->pixels[sy * img->pitch + sx]);
        }
    }
}

void desktop_paint_wallpaper_preview(struct surface *s, struct rect r, int index)
{
    struct surface *img = load_wallpaper_image(index);
    if (img) {
        draw_image_scaled(s, r, img);
        surface_destroy(img);
        return;
    }
    switch (index) {
    default:
    case 0:
        gfx_gradient_v(s, r, RGB(26, 32, 58), RGB(58, 30, 74));
        for (int i = 6; i >= 1; i--) {
            int rr = (r.w / 17) + i * (r.w / 36);
            gfx_fill_rounded(s, (struct rect){ r.x + r.w / 2 - rr, r.y + r.h / 2 - 40 * r.h / 768 - rr, rr * 2, rr * 2 }, rr,
                             RGBA(120, 90, 200, 10));
        }
        break;
    case 1:
        gfx_gradient_v(s, (struct rect){ r.x, r.y, r.w, r.h / 2 }, RGB(28, 40, 90), RGB(200, 90, 120));
        gfx_gradient_v(s, (struct rect){ r.x, r.y + r.h / 2, r.w, r.h - r.h / 2 }, RGB(200, 90, 120), RGB(250, 170, 90));
        for (int i = 0; i < 5; i++) {
            int y = r.y + r.h / 5 + i * r.h / 9;
            gfx_fill_alpha(s, (struct rect){ r.x, y, r.w, r.h / 40 + 1 }, RGBA(255, 220, 200, 22));
        }
        break;
    case 2:
        gfx_gradient_v(s, r, RGB(10, 30, 28), RGB(30, 90, 60));
        for (int i = 0; i < 4; i++) {
            int rr = r.w / 3 + i * r.w / 10;
            int cx = r.x + (i * 2 + 1) * r.w / 7;
            gfx_fill_rounded(s, (struct rect){ cx - rr, r.y + r.h * 3 / 4 + i * r.h / 24, rr * 2, rr * 2 }, rr,
                             RGBA(20, 60 + i * 15, 40 + i * 10, 200));
        }
        break;
    }
}

static void build_wallpaper(void)
{
    struct rect full = { 0, 0, screen->w, screen->h };
    struct surface *img = load_wallpaper_image(settings.wallpaper);
    if (img) {
        if (img->w == screen->w && img->h == screen->h)
            gfx_copy(wallpaper, 0, 0, img, (struct rect){ 0, 0, img->w, img->h });
        else
            draw_image_scaled(wallpaper, full, img);
        surface_destroy(img);
        return;                 /* l'image contient deja son identite visuelle */
    }
    desktop_paint_wallpaper_preview(wallpaper, full, settings.wallpaper);
    int cx = screen->w / 2, cy = screen->h / 2 - 40;
    if (logo_px) {
        int sz = 200;
        gfx_fill_rounded(wallpaper, (struct rect){ cx - sz / 2 - 6, cy - sz / 2 - 6, sz + 12, sz + 12 },
                         40, RGBA(255, 255, 255, 30));
        gfx_draw_rgba_scaled(wallpaper, cx - sz / 2, cy - sz / 2, sz, sz, logo_size, logo_size, logo_px);
    }
    const char *name = "NoxOS";
    gfx_text(wallpaper, cx - gfx_text_width(name) / 2, cy + 120, name, RGBA(255, 255, 255, 200));
}

void desktop_set_wallpaper(int index)
{
    if (index < 0 || index >= WALLPAPER_COUNT)
        return;
    settings.wallpaper = index;
    build_wallpaper();
    need_redraw = true;
}

static void draw_window(struct window *w)
{
    struct rect f = w->frame;
    bool active = (w == focused);

    if (w->popup) {
        gfx_fill_rounded(back, (struct rect){ f.x + 2, f.y + 4, f.w, f.h }, WM_RADIUS, C_SHADOW);
        gfx_fill_rounded(back, f, WM_RADIUS, C_WINDOW);
        gfx_copy(back, f.x, f.y + WM_TITLE_H, w->content, (struct rect){ 0, 0, w->content->w, w->content->h });
        return;
    }
    /* ombre */
    gfx_fill_rounded(back, (struct rect){ f.x + 3, f.y + 5, f.w, f.h }, WM_RADIUS + 2, C_SHADOW);
    /* barre de titre */
    gfx_fill_rounded(back, (struct rect){ f.x, f.y, f.w, WM_TITLE_H + WM_RADIUS }, WM_RADIUS,
                     active ? C_TITLE : C_TITLE_INACT);
    /* contenu */
    gfx_copy(back, f.x, f.y + WM_TITLE_H, w->content, (struct rect){ 0, 0, w->content->w, w->content->h });
    gfx_hline(back, f.x, f.y + WM_TITLE_H - 1, f.w, RGBA(0, 0, 0, 25));
    /* pastilles (fermer / reduire / agrandir) */
    u32 dots[3] = { RGB(255, 95, 87), RGB(255, 189, 46), RGB(40, 201, 64) };
    for (int i = 0; i < 3; i++) {
        struct rect d = { f.x + 12 + i * 20, f.y + WM_TITLE_H / 2 - 6, 12, 12 };
        gfx_fill_rounded(back, d, 6, active ? dots[i] : RGB(200, 200, 205));
    }
    /* titre centre, avec son icone */
    int tw = gfx_text_width(w->title) + 22;
    int tx = f.x + (f.w - tw) / 2;
    wm_draw_icon(back, tx, f.y + WM_TITLE_H / 2 - 8, 16, w->icon);
    gfx_text(back, tx + 22, f.y + (WM_TITLE_H - FONT_H) / 2, w->title, active ? C_TEXT : C_TEXT_DIM);
    gfx_rect(back, f, C_BORDER);
}

static void add_dock_item(int x, int y, enum app_icon icon, struct window *win)
{
    if (dock_count >= 24)
        return;
    dock_items[dock_count++] = (struct dock_item){ { x, y, DOCK_ICON + DOCK_PAD, DOCK_ICON + DOCK_PAD }, icon, win };
}

static void draw_taskbar(void)
{
    static const enum app_icon launchers[] = { ICON_EXPLORER, ICON_TERMINAL, ICON_SETTINGS, ICON_TASKMGR };
    dock_count = 0;

    /* fenetres ouvertes non epinglees */
    int extra = 0;
    for (struct window *t = windows; t; t = t->next) {
        if (t->popup) continue;
        bool pinned = false;
        for (u32 i = 0; i < 4; i++) if (t->icon == launchers[i]) pinned = true;
        if (!pinned) extra++;
    }
    int slots = 1 + 4 + (extra ? extra : 0);
    int step = DOCK_ICON + DOCK_PAD + 6;
    int dock_w = slots * step + 16 + (extra ? 10 : 0);
    int bar_y = settings.taskbar_top ? 0 : screen->h - TASKBAR_H;

    /* fond leger sur toute la largeur (comme Windows), pilule au centre (macOS) */
    gfx_fill_alpha(back, (struct rect){ 0, bar_y, screen->w, TASKBAR_H }, RGBA(10, 12, 18, 90));
    int dock_x = settings.taskbar_left_align ? 12 : (screen->w - dock_w) / 2;
    int dock_y = bar_y + (TASKBAR_H - DOCK_H) / 2;
    dock_rect = (struct rect){ dock_x, dock_y, dock_w, DOCK_H };
    gfx_fill_rounded(back, dock_rect, 16, C_PANEL);
    gfx_rect(back, dock_rect, RGBA(255, 255, 255, 25));

    int x = dock_x + 8, iy = dock_y + (DOCK_H - DOCK_ICON) / 2;
    /* bouton menu (logo) */
    {
        struct rect hit = { x, iy - DOCK_PAD / 2, DOCK_ICON + DOCK_PAD, DOCK_ICON + DOCK_PAD };
        if (menu_open || rect_contains(hit, hover_x, hover_y))
            gfx_fill_rounded(back, hit, 10, RGBA(255, 255, 255, 40));
        wm_draw_icon(back, x + DOCK_PAD / 2, iy, DOCK_ICON, ICON_NOX);
        add_dock_item(x, iy - DOCK_PAD / 2, ICON_NOX, NULL);
        x += step;
    }
    gfx_vline(back, x - 3, dock_y + 12, DOCK_H - 24, RGBA(255, 255, 255, 40));
    x += 4;
    for (u32 i = 0; i < 4; i++) {
        struct window *open = wm_find_icon(launchers[i]);
        struct rect hit = { x, iy - DOCK_PAD / 2, DOCK_ICON + DOCK_PAD, DOCK_ICON + DOCK_PAD };
        if (rect_contains(hit, hover_x, hover_y))
            gfx_fill_rounded(back, hit, 10, RGBA(255, 255, 255, 40));
        wm_draw_icon(back, x + DOCK_PAD / 2, iy, DOCK_ICON - 6, launchers[i]);
        if (open)   /* point sous l'icone = application ouverte */
            gfx_fill_rounded(back, (struct rect){ x + (DOCK_ICON + DOCK_PAD) / 2 - 3, dock_y + DOCK_H - 7, 6, 4 }, 2,
                             open == focused ? C_TEXT_LIGHT : RGBA(255, 255, 255, 130));
        add_dock_item(x, iy - DOCK_PAD / 2, launchers[i], open);
        x += step;
    }
    if (extra) {
        gfx_vline(back, x - 3, dock_y + 12, DOCK_H - 24, RGBA(255, 255, 255, 40));
        x += 4;
        for (struct window *t = windows; t; t = t->next) {
            if (t->popup) continue;
            bool pinned = false;
            for (u32 i = 0; i < 4; i++) if (t->icon == launchers[i]) pinned = true;
            if (pinned) continue;
            struct rect hit = { x, iy - DOCK_PAD / 2, DOCK_ICON + DOCK_PAD, DOCK_ICON + DOCK_PAD };
            if (rect_contains(hit, hover_x, hover_y))
                gfx_fill_rounded(back, hit, 10, RGBA(255, 255, 255, 40));
            wm_draw_icon(back, x + DOCK_PAD / 2 + 4, iy + 4, DOCK_ICON - 14, t->icon);
            gfx_fill_rounded(back, (struct rect){ x + (DOCK_ICON + DOCK_PAD) / 2 - 3, dock_y + DOCK_H - 7, 6, 4 }, 2,
                             t == focused ? C_TEXT_LIGHT : RGBA(255, 255, 255, 130));
            add_dock_item(x, iy - DOCK_PAD / 2, t->icon, t);
            x += step;
        }
    }

    /* zone d'etat a droite : horloge, date, langue */
    if (settings.show_clock) {
        struct rtc_time t;
        rtc_read(&t);
        char clock[8], date[12];
        clock[0] = (char)('0' + t.hour / 10); clock[1] = (char)('0' + t.hour % 10); clock[2] = ':';
        clock[3] = (char)('0' + t.minute / 10); clock[4] = (char)('0' + t.minute % 10); clock[5] = 0;
        date[0] = (char)('0' + t.day / 10); date[1] = (char)('0' + t.day % 10); date[2] = '/';
        date[3] = (char)('0' + t.month / 10); date[4] = (char)('0' + t.month % 10); date[5] = '/';
        utoa(t.year, date + 6, 10);
        int rx = screen->w - 16;
        gfx_fill_rounded(back, (struct rect){ rx - 100, dock_y, 100, DOCK_H }, 14, C_PANEL);
        gfx_text(back, rx - 100 + 50 - gfx_text_width(clock) / 2, dock_y + 10, clock, C_TEXT_LIGHT);
        gfx_text(back, rx - 100 + 50 - gfx_text_width(date) / 2, dock_y + 30, date, RGBA(255, 255, 255, 150));
        const char *lg = lang_get() == LANG_FR ? "FR" : "EN";
        gfx_fill_rounded(back, (struct rect){ rx - 150, dock_y + 8, 40, DOCK_H - 16 }, 10, C_PANEL);
        gfx_text(back, rx - 150 + 20 - gfx_text_width(lg) / 2, dock_y + (DOCK_H - FONT_H) / 2, lg, C_TEXT_LIGHT);
    }
}

struct menu_item { enum str_id label; enum app_icon icon; int action; };
static const struct menu_item menu_items[] = {
    { STR_EXPLORER, ICON_EXPLORER, 1 }, { STR_TERMINAL, ICON_TERMINAL, 2 },
    { STR_SETTINGS, ICON_SETTINGS, 3 }, { STR_TASKMGR, ICON_TASKMGR, 4 },
    { STR_ABOUT, ICON_INFO, 5 },
    { STR_REBOOT, ICON_POWER, 6 }, { STR_SHUTDOWN, ICON_POWER, 7 },
};
#define MENU_ITEMS ((int)(sizeof(menu_items) / sizeof(menu_items[0])))
#define MENU_ROW   40

static void draw_menu(void)
{
    int h = 16 + FONT_H + 8 + MENU_ITEMS * MENU_ROW + 12 + 20;
    int x = settings.taskbar_left_align ? 12 : dock_rect.x;
    int y = settings.taskbar_top ? TASKBAR_H + 8 : screen->h - TASKBAR_H - 8 - h;
    menu_rect = (struct rect){ x, y, MENU_W, h };
    gfx_fill_rounded(back, (struct rect){ x + 2, y + 4, MENU_W, h }, 14, C_SHADOW);
    gfx_fill_rounded(back, menu_rect, 14, RGBA(30, 32, 42, 240));
    gfx_rect(back, menu_rect, RGBA(255, 255, 255, 30));
    gfx_text(back, x + 16, y + 12, L(STR_APPS), RGBA(255, 255, 255, 140));
    int ry = y + 12 + FONT_H + 8;
    for (int i = 0; i < MENU_ITEMS; i++) {
        if (i == 5) {
            gfx_hline(back, x + 12, ry + 4, MENU_W - 24, RGBA(255, 255, 255, 40));
            ry += 12;
            gfx_text(back, x + 16, ry - 2, L(STR_SYSTEM), RGBA(255, 255, 255, 140));
            ry += FONT_H + 4;
        }
        struct rect row = { x + 8, ry, MENU_W - 16, MENU_ROW };
        if (rect_contains(row, hover_x, hover_y))
            gfx_fill_rounded(back, row, 8, RGBA(255, 255, 255, 30));
        wm_draw_icon(back, x + 16, ry + 8, 24, menu_items[i].icon);
        gfx_text(back, x + 52, ry + (MENU_ROW - FONT_H) / 2, L(menu_items[i].label), C_TEXT_LIGHT);
        ry += MENU_ROW;
    }
}

static int menu_hit(int mx, int my)
{
    int ry = menu_rect.y + 12 + FONT_H + 8;
    for (int i = 0; i < MENU_ITEMS; i++) {
        if (i == 5) ry += 12 + FONT_H + 4;
        struct rect row = { menu_rect.x + 8, ry, MENU_W - 16, MENU_ROW };
        if (rect_contains(row, mx, my))
            return menu_items[i].action;
        ry += MENU_ROW;
    }
    return 0;
}

static void draw_cursor(int mx, int my)
{
    /* fleche 12x19 : 1 = noir, 2 = blanc */
    static const char *shape[19] = {
        "1...........", "11..........", "121.........", "1221........", "12221.......",
        "122221......", "1222221.....", "12222221....", "122222221...", "1222222221..",
        "12222222221.", "122222111111", "1222221.....", "122221......", "12211.......",
        "1211........", "11.1........", "1...........", "............",
    };
    for (int y = 0; y < 19; y++)
        for (int x = 0; x < 12; x++) {
            char c = shape[y][x];
            if (c == '.') continue;
            gfx_fill(back, (struct rect){ mx + x, my + y, 1, 1 }, c == '1' ? RGB(0, 0, 0) : RGB(255, 255, 255));
        }
}

static void compose(void)
{
    int mx, my;
    mouse_state(&mx, &my, NULL);

    gfx_copy(back, 0, 0, wallpaper, (struct rect){ 0, 0, wallpaper->w, wallpaper->h });
    for (struct window *w = windows; w; w = w->next) {
        if (w->dirty && w->paint) {
            w->paint(w);
            w->dirty = false;
        }
        draw_window(w);
    }
    draw_taskbar();
    if (menu_open)
        draw_menu();
    draw_cursor(mx, my);

    /* presentation : une copie lineaire du backbuffer vers l'ecran */
    if (screen->pitch == back->pitch)
        memcpy(screen->pixels, back->pixels, (u32)screen->pitch * (u32)screen->h * 4u);
    else
        gfx_copy(screen, 0, 0, back, (struct rect){ 0, 0, back->w, back->h });
    need_redraw = false;
}

/* --------------------------------------------------------------------------
 * Entree
 * ------------------------------------------------------------------------ */
static struct window *window_at(int x, int y)
{
    struct window *hit = NULL;
    for (struct window *w = windows; w; w = w->next)
        if (rect_contains(w->frame, x, y))
            hit = w;             /* le dernier trouve est le plus haut */
    return hit;
}

static void send(struct window *w, struct wm_event ev)
{
    if (w && w->event)
        w->event(w, &ev);
}

static void menu_action(int action)
{
    menu_open = false;
    switch (action) {
    case 1: app_open_explorer(NULL); break;
    case 2: app_open_terminal(); break;
    case 3: app_open_settings(); break;
    case 4: app_open_taskmgr(); break;
    case 5: app_open_about(); break;
    case 6: desktop_reboot(); break;
    case 7: desktop_shutdown(); break;
    default: break;
    }
    need_redraw = true;
}

static void dock_click(enum app_icon icon, struct window *win)
{
    if (icon == ICON_NOX) { menu_open = !menu_open; need_redraw = true; return; }
    if (win) { wm_focus(win); return; }
    switch (icon) {
    case ICON_EXPLORER: app_open_explorer(NULL); break;
    case ICON_TERMINAL: app_open_terminal(); break;
    case ICON_SETTINGS: app_open_settings(); break;
    case ICON_TASKMGR:  app_open_taskmgr(); break;
    default: break;
    }
}

static void handle_mouse(const struct mouse_event *m)
{
    hover_x = m->x; hover_y = m->y;
    need_redraw = true;

    if (m->type == MOUSE_MOVE) {
        if (drag_win) {
            drag_win->frame.x = m->x - drag_dx;
            drag_win->frame.y = m->y - drag_dy;
            return;
        }
        struct window *w = window_at(m->x, m->y);
        if (w && (w == focused || w->popup))
            send(w, (struct wm_event){ WM_MOUSE_MOVE, m->x - w->frame.x,
                                       m->y - w->frame.y - WM_TITLE_H, m->buttons, 0 });
        return;
    }

    if (m->type == MOUSE_UP) {
        if (drag_win && m->button == MOUSE_LEFT)
            drag_win = NULL;
        struct window *w = window_at(m->x, m->y);
        if (w)
            send(w, (struct wm_event){ WM_MOUSE_UP, m->x - w->frame.x,
                                       m->y - w->frame.y - WM_TITLE_H, m->button, 0 });
        return;
    }

    /* MOUSE_DOWN */
    if (menu_open) {
        if (rect_contains(menu_rect, m->x, m->y)) {
            menu_action(menu_hit(m->x, m->y));
            return;
        }
        menu_open = false;
    }
    for (int i = 0; i < dock_count; i++)
        if (rect_contains(dock_items[i].r, m->x, m->y)) {
            dock_click(dock_items[i].icon, dock_items[i].win);
            return;
        }
    int bar_y = settings.taskbar_top ? 0 : screen->h - TASKBAR_H;
    if (m->y >= bar_y && m->y < bar_y + TASKBAR_H)
        return;

    struct window *w = window_at(m->x, m->y);
    /* popup ouvert et clic ailleurs : on le ferme */
    for (struct window *t = windows; t; ) {
        struct window *n = t->next;
        if (t->popup && t != w)
            wm_destroy(t);
        t = n;
    }
    if (!w)
        return;
    wm_focus(w);
    int ly = m->y - w->frame.y;
    if (!w->popup && ly < WM_TITLE_H) {
        /* pastille rouge = fermer */
        if (rect_contains((struct rect){ w->frame.x + 8, w->frame.y + 4, 20, WM_TITLE_H - 8 }, m->x, m->y)
            && m->button == MOUSE_LEFT) {
            wm_destroy(w);
            return;
        }
        if (m->button == MOUSE_LEFT) {
            drag_win = w;
            drag_dx = m->x - w->frame.x;
            drag_dy = m->y - w->frame.y;
        }
        return;
    }
    u32 now = timer_ticks();
    bool dbl = m->button == MOUSE_LEFT &&
               (now - last_click_tick) * (1000 / TIMER_HZ) < DBLCLICK_MS &&
               (m->x - last_click_x) * (m->x - last_click_x) + (m->y - last_click_y) * (m->y - last_click_y) < 64;
    last_click_tick = now; last_click_x = m->x; last_click_y = m->y;
    send(w, (struct wm_event){ dbl ? WM_MOUSE_DBLCLICK : WM_MOUSE_DOWN,
                               m->x - w->frame.x, ly - WM_TITLE_H, m->button, 0 });
}

/* --------------------------------------------------------------------------
 * Thread du bureau
 * ------------------------------------------------------------------------ */
static void load_logo(void)
{
    if (!fs_mounted())
        return;
    int idx = fs_lookup("/sys/logo.rgba", 0);
    if (idx < 0)
        return;
    u32 size;
    u32 *px = fs_load(idx, &size);
    if (!px)
        return;
    /* image carree sans en-tete : cote = sqrt(size / 4) */
    int side = 1;
    while ((u32)(side + 1) * (u32)(side + 1) * 4u <= size)
        side++;
    if ((u32)side * (u32)side * 4u != size) {
        kfree(px);
        return;
    }
    logo_px = px;
    logo_size = side;
}

static void desktop_thread(void *arg)
{
    (void)arg;
    u32 last_tick = timer_ticks();
    running = true;
    console_grab_keyboard(true);
    app_open_explorer(NULL);
    app_open_terminal();            /* au premier plan : le clavier va au shell */
    compose();

    for (;;) {
        struct mouse_event m;
        while (mouse_poll_event(&m))
            handle_mouse(&m);

        char c;
        while (keyboard_poll(&c)) {
            if (menu_open && c == 27) { menu_open = false; need_redraw = true; continue; }
            send(focused, (struct wm_event){ WM_KEY, 0, 0, 0, c });
            need_redraw = true;
        }

        u32 now = timer_ticks();
        if (now - last_tick >= TIMER_HZ / 2) {
            last_tick = now;
            for (struct window *w = windows; w; w = w->next)
                send(w, (struct wm_event){ WM_TICK, 0, 0, 0, 0 });
            need_redraw = true;         /* horloge */
        }

        if (need_redraw)
            compose();
        thread_sleep_ms(16);
    }
}

bool desktop_start(void)
{
    if (running)
        return true;
    screen = fb_surface();
    if (!screen) {
        kprintf("desktop: no framebuffer (VBE mode not available)\n");
        return false;
    }
    back = surface_create(screen->w, screen->h);
    wallpaper = surface_create(screen->w, screen->h);
    if (!back || !wallpaper) {
        kprintf("desktop: out of memory\n");
        return false;
    }
    load_logo();
    if (settings.wallpaper_auto) {
        /* rotation "a chaque demarrage" : la seconde RTC sert de graine */
        struct rtc_time t;
        rtc_read(&t);
        settings.wallpaper = (t.second + t.minute + t.day) % WALLPAPER_COUNT;
    }
    build_wallpaper();
    thread_create("desktop", desktop_thread, NULL);
    return true;
}

bool desktop_running(void) { return running; }
struct desktop_settings *desktop_settings(void) { return &settings; }

void desktop_settings_changed(void)
{
    struct rect wa = wm_workarea();
    for (struct window *w = windows; w; w = w->next) {
        if (w->frame.y < wa.y) w->frame.y = wa.y + 8;
        if (w->frame.y + w->frame.h > wa.y + wa.h) w->frame.y = wa.y + wa.h - w->frame.h - 8;
    }
    need_redraw = true;
}

void desktop_lang_changed(void)
{
    for (struct window *w = windows; w; w = w->next) {
        send(w, (struct wm_event){ WM_LANG, 0, 0, 0, 0 });
        w->dirty = true;
    }
    need_redraw = true;
}

void desktop_reboot(void)
{
    kprintf("desktop: reboot\n");
    outb(0x64, 0xFE);                 /* 8042 : impulsion reset */
    for (;;) hlt();
}

void desktop_shutdown(void)
{
    kprintf("desktop: power off\n");
    outw(0x604, 0x2000);              /* QEMU (ACPI PM1a) */
    outw(0xB004, 0x2000);             /* Bochs / anciens QEMU */
    outw(0x4004, 0x3400);             /* VirtualBox */
    gfx_fill(screen, (struct rect){ 0, 0, screen->w, screen->h }, C_BG_DARK);
    const char *msg = lang_get() == LANG_FR ? "Vous pouvez \xE9teindre l'ordinateur." : "You can now turn off the computer.";
    gfx_text(screen, (screen->w - gfx_text_width(msg)) / 2, screen->h / 2, msg, C_TEXT_LIGHT);
    cli();
    for (;;) hlt();
}
