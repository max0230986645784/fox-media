/* NoxOS - applications du bureau v0.4 (fenetres kernel)
 *
 *   Terminal              : le shell kernel (kmain) dans une fenetre, via
 *                           console_set_sink() / console_inject()
 *   Explorateur           : NoxFS (lecture seule), barre laterale Accueil /
 *                           Documents / Images / Musique / Videos / Telechargements
 *   Lecteur de texte      : fichiers .txt / etc
 *   Parametres            : langue, barre des taches, fond d'ecran, confidentialite
 *   Gestionnaire des taches
 *   A propos
 */
#include <nox/desktop.h>
#include <nox/wm.h>
#include <nox/lang.h>
#include <nox/gfx.h>
#include <nox/fs.h>
#include <nox/memory.h>
#include <nox/thread.h>
#include <nox/process.h>
#include <nox/timer.h>
#include <nox/printk.h>
#include <nox/string.h>

#define PAD 12
#define ROW 24

static void draw_num(struct surface *s, int x, int y, u32 v, u32 fg)
{
    char b[16];
    gfx_text(s, x, y, utoa(v, b, 10), fg);
}

static void clear_content(struct window *w, u32 color)
{
    gfx_fill(w->content, (struct rect){ 0, 0, w->content->w, w->content->h }, color);
}

/* ==========================================================================
 * Terminal
 * ======================================================================== */
#define TERM_COLS 100
#define TERM_ROWS 60

struct term {
    char grid[TERM_ROWS][TERM_COLS];
    int  cols, rows;          /* visibles */
    int  cx, cy;
};

static struct term   *term;           /* un seul terminal (le shell est unique) */
static struct window *term_win;

static void term_scroll(struct term *t)
{
    memmove(t->grid[0], t->grid[1], sizeof(t->grid[0]) * (TERM_ROWS - 1));
    memset(t->grid[TERM_ROWS - 1], ' ', TERM_COLS);
    if (t->cy > 0) t->cy--;
}

static void term_sink(char c)
{
    struct term *t = term;
    if (!t)
        return;
    switch (c) {
    case '\n': t->cx = 0; t->cy++; break;
    case '\r': t->cx = 0; break;
    case '\b': if (t->cx > 0) { t->cx--; t->grid[t->cy][t->cx] = ' '; } break;
    case '\t': t->cx = (t->cx + 8) & ~7; break;
    default:
        if ((unsigned char)c < 32) break;
        t->grid[t->cy][t->cx] = c;
        t->cx++;
        break;
    }
    if (t->cx >= t->cols) { t->cx = 0; t->cy++; }
    while (t->cy >= t->rows)
        term_scroll(t);
    if (term_win)
        wm_invalidate(term_win);
}

static void term_paint(struct window *w)
{
    struct term *t = w->data;
    clear_content(w, C_TERM_BG);
    for (int y = 0; y < t->rows; y++) {
        char line[TERM_COLS + 1];
        memcpy(line, t->grid[y], (size_t)t->cols);
        line[t->cols] = '\0';
        gfx_text(w->content, 6, 4 + y * FONT_H, line, C_TERM_FG);
    }
    if (w == wm_focused())
        gfx_fill(w->content, (struct rect){ 6 + t->cx * FONT_W, 4 + t->cy * FONT_H + FONT_H - 2, FONT_W, 2 }, C_ACCENT);
}

static void term_event(struct window *w, const struct wm_event *ev)
{
    switch (ev->type) {
    case WM_KEY:
        console_inject(ev->key);
        break;
    case WM_LANG:
        wm_set_title(w, L(STR_TERMINAL));
        break;
    case WM_CLOSE:
        console_set_sink(NULL);
        term_win = NULL;
        kfree(term);
        term = NULL;
        break;
    default:
        break;
    }
}

void app_open_terminal(void)
{
    if (term_win) { wm_focus(term_win); return; }
    int cols = 80, rows = 24;
    int w = cols * FONT_W + 12, h = rows * FONT_H + 8 + WM_TITLE_H;
    struct rect wa = wm_workarea();
    term = kmalloc(sizeof(*term));
    if (!term) return;
    memset(term->grid, ' ', sizeof(term->grid));
    term->cols = cols; term->rows = rows; term->cx = 0; term->cy = 0;
    term_win = wm_create(L(STR_TERMINAL), wa.x + 60, wa.y + 60, w, h,
                         ICON_TERMINAL, term_paint, term_event, term);
    if (!term_win) { kfree(term); term = NULL; return; }
    console_set_sink(term_sink);
    kprintf("%s\n", L(STR_TERMINAL_HINT));
    console_inject('\n');               /* fait reafficher l'invite nox> */
}

/* ==========================================================================
 * Lecteur de texte
 * ======================================================================== */
struct textview {
    char *data;
    u32   size;
    int   lines;
    int   top;
};

static int text_count_lines(const char *d, u32 n)
{
    int c = 1;
    for (u32 i = 0; i < n; i++)
        if (d[i] == '\n') c++;
    return c;
}

static void text_paint(struct window *w)
{
    struct textview *t = w->data;
    clear_content(w, C_WINDOW);
    int rows = (w->content->h - 30) / FONT_H;
    int cols = (w->content->w - 2 * PAD) / FONT_W;
    const char *p = t->data;
    for (int l = 0; l < t->top && *p; l++) {
        while (*p && *p != '\n') p++;
        if (*p) p++;
    }
    for (int r = 0; r < rows && *p; r++) {
        char line[200];
        int n = 0;
        while (*p && *p != '\n' && n < cols && n < 199) {
            if (*p != '\r') line[n++] = *p;
            p++;
        }
        line[n] = '\0';
        while (*p && *p != '\n') p++;
        if (*p) p++;
        gfx_text(w->content, PAD, 8 + r * FONT_H, line, C_TEXT);
    }
    /* barre d'etat */
    struct rect st = { 0, w->content->h - 22, w->content->w, 22 };
    gfx_fill(w->content, st, C_WINDOW_ALT);
    draw_num(w->content, PAD, st.y + 3, (u32)t->lines, C_TEXT_DIM);
    char b[16];
    int x = PAD + gfx_text_width(utoa((u32)t->lines, b, 10)) + FONT_W;
    gfx_text(w->content, x, st.y + 3, L(STR_LINES), C_TEXT_DIM);
    const char *hint = L(STR_SCROLL_HINT);
    gfx_text(w->content, w->content->w - PAD - gfx_text_width(hint), st.y + 3, hint, C_TEXT_DIM);
}

static void text_event(struct window *w, const struct wm_event *ev)
{
    struct textview *t = w->data;
    int rows = (w->content->h - 30) / FONT_H;
    switch (ev->type) {
    case WM_KEY:
        if (ev->key == 'j' && t->top + rows < t->lines) t->top++;
        if (ev->key == 'k' && t->top > 0) t->top--;
        if (ev->key == ' ' && t->top + rows < t->lines) t->top += rows;
        wm_invalidate(w);
        break;
    case WM_CLOSE:
        kfree(t->data);
        kfree(t);
        break;
    default:
        break;
    }
}

void app_open_text(const char *path)
{
    int idx = fs_lookup(path, 0);
    const struct noxfs_entry *e = fs_entry(idx);
    if (idx < 0 || !e || e->type != NOXFS_FILE)
        return;
    struct textview *t = kmalloc(sizeof(*t));
    if (!t) return;
    t->data = fs_load(idx, &t->size);
    if (!t->data) { kfree(t); return; }
    for (u32 i = 0; i < t->size; i++)
        if (t->data[i] == '\0') t->data[i] = ' ';
    t->lines = text_count_lines(t->data, t->size);
    t->top = 0;
    struct rect wa = wm_workarea();
    struct window *w = wm_create(e->name, wa.x + 160, wa.y + 90, 640, 440,
                                 ICON_TEXT, text_paint, text_event, t);
    if (!w) { kfree(t->data); kfree(t); }
}

/* ==========================================================================
 * Explorateur
 * ======================================================================== */
#define EXP_SIDEBAR 170
#define EXP_HEADER  40
#define EXP_ROW     28

struct place { enum str_id label; const char *path; enum app_icon icon; };
static const struct place places[] = {
    { STR_HOME,      "/home/user",                 ICON_HOME },
    { STR_DOCUMENTS, "/home/user/Documents",       ICON_FOLDER },
    { STR_IMAGES,    "/home/user/Images",          ICON_IMAGE },
    { STR_MUSIC,     "/home/user/Musique",         ICON_MUSIC },
    { STR_VIDEOS,    "/home/user/Videos",          ICON_VIDEO },
    { STR_DOWNLOADS, "/home/user/Telechargements", ICON_DOWNLOAD },
    { STR_COMPUTER,  "/",                          ICON_NOX },
};
#define N_PLACES ((int)(sizeof(places) / sizeof(places[0])))

struct explorer {
    int dir;            /* index NoxFS du repertoire affiche, -1 sans disque */
    int selected;       /* index NoxFS de l'entree selectionnee, -1 aucune */
    int scroll;
};

static bool has_ext(const char *name, const char *ext)
{
    size_t n = strlen(name), m = strlen(ext);
    return n > m && strcmp(name + n - m, ext) == 0;
}

static enum app_icon icon_for(const struct noxfs_entry *e)
{
    if (e->type == NOXFS_DIR) return ICON_FOLDER;
    if (has_ext(e->name, ".nxi") || has_ext(e->name, ".rgba")) return ICON_IMAGE;
    if (has_ext(e->name, ".txt") || has_ext(e->name, ".md")) return ICON_TEXT;
    return ICON_FILE;
}

static void explorer_go(struct window *w, struct explorer *x, int dir)
{
    const struct noxfs_entry *e = fs_entry(dir);
    if (!e || e->type != NOXFS_DIR)
        return;
    x->dir = dir; x->selected = -1; x->scroll = 0;
    char path[128];
    fs_path_of(dir, path, sizeof(path));
    char title[WM_TITLE_MAX];
    strncpy(title, L(STR_EXPLORER), sizeof(title) - 1);
    title[sizeof(title) - 1] = '\0';
    size_t n = strlen(title);
    if (n + 3 < sizeof(title)) {
        title[n++] = ' '; title[n++] = '-'; title[n++] = ' ';
        strncpy(title + n, path, sizeof(title) - 1 - n);
        title[sizeof(title) - 1] = '\0';
    }
    wm_set_title(w, title);
    wm_invalidate(w);
}

static void explorer_paint(struct window *w)
{
    struct explorer *x = w->data;
    struct surface *s = w->content;
    clear_content(w, C_WINDOW);
    gfx_fill(s, (struct rect){ 0, 0, EXP_SIDEBAR, s->h }, C_WINDOW_ALT);

    for (int i = 0; i < N_PLACES; i++) {
        int y = PAD + i * (EXP_ROW + 6);
        int idx = fs_mounted() ? fs_lookup(places[i].path, 0) : -1;
        bool cur = idx >= 0 && idx == x->dir;
        if (cur)
            gfx_fill_rounded(s, (struct rect){ 6, y - 4, EXP_SIDEBAR - 12, EXP_ROW + 2 }, 6, C_SELECT);
        wm_draw_icon(s, 14, y - 1, 20, places[i].icon);
        gfx_text(s, 44, y + 2, L(places[i].label), idx >= 0 ? C_TEXT : C_TEXT_DIM);
    }

    int lx = EXP_SIDEBAR + PAD;
    if (!fs_mounted() || x->dir < 0) {
        gfx_text(s, lx, PAD, L(STR_NO_DISK), C_TEXT_DIM);
        return;
    }
    char path[128];
    fs_path_of(x->dir, path, sizeof(path));
    gfx_fill_rounded(s, (struct rect){ lx - 4, 8, s->w - lx - PAD + 4, 26 }, 6, C_WINDOW_ALT);
    gfx_text(s, lx + 4, 13, path, C_TEXT);

    int y = EXP_HEADER + PAD, count = 0, row = 0;
    int maxy = s->h - 30;
    if (x->dir != fs_lookup("/", 0)) {
        if (row >= x->scroll && y < maxy) {
            wm_draw_icon(s, lx, y + 2, 20, ICON_FOLDER);
            gfx_text(s, lx + 30, y + 5, "..", C_TEXT_DIM);
            y += EXP_ROW;
        }
        row++;
    }
    for (int i = fs_next_child(x->dir, -1); i >= 0; i = fs_next_child(x->dir, i)) {
        const struct noxfs_entry *e = fs_entry(i);
        count++;
        if (row++ < x->scroll || y >= maxy)
            continue;
        if (i == x->selected)
            gfx_fill_rounded(s, (struct rect){ lx - 4, y - 1, s->w - lx - PAD + 4, EXP_ROW - 2 }, 6, C_SELECT);
        wm_draw_icon(s, lx, y + 2, 20, icon_for(e));
        gfx_text(s, lx + 30, y + 5, e->name, C_TEXT);
        if (e->type == NOXFS_FILE) {
            char b[16];
            const char *sz = utoa(e->size, b, 10);
            int tw = gfx_text_width(sz) + gfx_text_width(" o");
            gfx_text(s, s->w - PAD - tw, y + 5, sz, C_TEXT_DIM);
            gfx_text(s, s->w - PAD - gfx_text_width(" o"), y + 5, " o", C_TEXT_DIM);
        } else {
            gfx_text(s, s->w - PAD - gfx_text_width(L(STR_FOLDER)), y + 5, L(STR_FOLDER), C_TEXT_DIM);
        }
        y += EXP_ROW;
    }
    if (count == 0)
        gfx_text(s, lx, y + 5, L(STR_EMPTY_FOLDER), C_TEXT_DIM);

    struct rect st = { EXP_SIDEBAR, s->h - 22, s->w - EXP_SIDEBAR, 22 };
    gfx_fill(s, st, C_WINDOW_ALT);
    draw_num(s, st.x + PAD, st.y + 3, (u32)count, C_TEXT_DIM);
    char b[16];
    gfx_text(s, st.x + PAD + gfx_text_width(utoa((u32)count, b, 10)) + FONT_W, st.y + 3, L(STR_ITEMS), C_TEXT_DIM);
    const char *hint = L(STR_READ_ONLY_HINT);
    if (gfx_text_width(hint) + 120 < st.w)
        gfx_text(s, s->w - PAD - gfx_text_width(hint), st.y + 3, hint, C_TEXT_DIM);
}

/* index NoxFS de la ligne cliquee, -2 pour "..", -1 rien */
static int explorer_hit(struct window *w, struct explorer *x, int my)
{
    if (x->dir < 0 || my < EXP_HEADER + PAD || my >= w->content->h - 30)
        return -1;
    int row = (my - EXP_HEADER - PAD) / EXP_ROW + x->scroll;
    bool has_up = x->dir != fs_lookup("/", 0);
    if (has_up) {
        if (row == 0) return -2;
        row--;
    }
    for (int i = fs_next_child(x->dir, -1); i >= 0; i = fs_next_child(x->dir, i))
        if (row-- == 0) return i;
    return -1;
}

static void explorer_open(struct window *w, struct explorer *x, int idx)
{
    if (idx == -2) {
        explorer_go(w, x, fs_entry(x->dir)->parent);
        return;
    }
    const struct noxfs_entry *e = fs_entry(idx);
    if (!e) return;
    if (e->type == NOXFS_DIR) {
        explorer_go(w, x, idx);
    } else {
        char path[128];
        fs_path_of(idx, path, sizeof(path));
        app_open_text(path);
    }
}

static void explorer_event(struct window *w, const struct wm_event *ev)
{
    struct explorer *x = w->data;
    switch (ev->type) {
    case WM_MOUSE_DOWN:
        if (ev->button != 1) break;
        if (ev->x < EXP_SIDEBAR) {
            int i = (ev->y - PAD + 4) / (EXP_ROW + 6);
            if (i >= 0 && i < N_PLACES && fs_mounted()) {
                int idx = fs_lookup(places[i].path, 0);
                if (idx >= 0) explorer_go(w, x, idx);
            }
        } else {
            int hit = explorer_hit(w, x, ev->y);
            x->selected = hit >= 0 ? hit : -1;
            wm_invalidate(w);
        }
        break;
    case WM_MOUSE_DBLCLICK:
        if (ev->x >= EXP_SIDEBAR) {
            int hit = explorer_hit(w, x, ev->y);
            if (hit != -1) explorer_open(w, x, hit);
        }
        break;
    case WM_KEY:
        if (ev->key == '\n' && x->selected >= 0) explorer_open(w, x, x->selected);
        if (ev->key == '\b' && x->dir >= 0 && x->dir != fs_lookup("/", 0)) explorer_open(w, x, -2);
        if (ev->key == 'j') { x->scroll++; wm_invalidate(w); }
        if (ev->key == 'k' && x->scroll > 0) { x->scroll--; wm_invalidate(w); }
        break;
    case WM_LANG:
        if (x->dir >= 0) explorer_go(w, x, x->dir);
        else wm_set_title(w, L(STR_EXPLORER));
        break;
    case WM_CLOSE:
        kfree(x);
        break;
    default:
        break;
    }
}

void app_open_explorer(const char *path)
{
    struct explorer *x = kmalloc(sizeof(*x));
    if (!x) return;
    x->dir = -1; x->selected = -1; x->scroll = 0;
    struct rect wa = wm_workarea();
    struct window *w = wm_create(L(STR_EXPLORER), wa.x + 120, wa.y + 40, 720, 480,
                                 ICON_EXPLORER, explorer_paint, explorer_event, x);
    if (!w) { kfree(x); return; }
    if (fs_mounted()) {
        int idx = fs_lookup(path ? path : "/home/user", 0);
        if (idx < 0) idx = fs_lookup("/", 0);
        explorer_go(w, x, idx);
    }
}

/* ==========================================================================
 * Parametres
 * ======================================================================== */
struct setting_btn { struct rect r; int group, value; };

struct settings_ui {
    struct setting_btn btn[24];
    int nbtn;
};

enum { G_LANG, G_POS, G_ALIGN, G_CLOCK, G_WP, G_WP_AUTO };

static void add_btn(struct settings_ui *u, struct rect r, int group, int value)
{
    if (u->nbtn < 24)
        u->btn[u->nbtn++] = (struct setting_btn){ r, group, value };
}

static int section(struct surface *s, int y, const char *title)
{
    gfx_text(s, PAD, y, title, C_ACCENT_DARK);
    gfx_hline(s, PAD, y + FONT_H + 4, s->w - 2 * PAD, RGB(210, 213, 222));
    return y + FONT_H + 14;
}

static int choice_row(struct surface *s, struct settings_ui *u, int y, const char *label,
                      int group, int cur, const char *a, const char *b)
{
    gfx_text(s, PAD + 8, y + 5, label, C_TEXT);
    int x = 260;
    struct rect ra = { x, y, 110, 26 }, rb = { x + 118, y, 110, 26 };
    wm_draw_button(s, ra, a, cur == 0);
    wm_draw_button(s, rb, b, cur == 1);
    add_btn(u, ra, group, 0);
    add_btn(u, rb, group, 1);
    return y + 36;
}

static void settings_paint(struct window *w)
{
    struct settings_ui *u = w->data;
    struct surface *s = w->content;
    struct desktop_settings *d = desktop_settings();
    u->nbtn = 0;
    clear_content(w, C_WINDOW);

    int y = PAD;
    y = section(s, y, L(STR_LANGUAGE));
    y = choice_row(s, u, y, L(STR_LANGUAGE), G_LANG, lang_get() == LANG_EN, L(STR_FRENCH), L(STR_ENGLISH));

    y = section(s, y + 6, L(STR_TASKBAR));
    y = choice_row(s, u, y, L(STR_TASKBAR_POS), G_POS, d->taskbar_top, L(STR_BOTTOM), L(STR_TOP));
    y = choice_row(s, u, y, L(STR_TASKBAR_ALIGN), G_ALIGN, d->taskbar_left_align, L(STR_CENTER), L(STR_LEFT));
    y = choice_row(s, u, y, L(STR_SHOW_CLOCK), G_CLOCK, !d->show_clock, L(STR_YES), L(STR_NO));

    y = section(s, y + 6, L(STR_WALLPAPER));
    static const enum str_id wp_names[WALLPAPER_COUNT] = { STR_WP_NIGHT, STR_WP_AURORA, STR_WP_FOREST };
    int pw = 150, ph = 94;
    for (int i = 0; i < WALLPAPER_COUNT; i++) {
        struct rect r = { PAD + 8 + i * (pw + 16), y, pw, ph };
        if (d->wallpaper == i)
            gfx_fill_rounded(s, (struct rect){ r.x - 3, r.y - 3, r.w + 6, r.h + 6 }, 8, C_ACCENT);
        desktop_paint_wallpaper_preview(s, r, i);
        const char *nm = L(wp_names[i]);
        gfx_text(s, r.x + (r.w - gfx_text_width(nm)) / 2, r.y + r.h + 6, nm, C_TEXT);
        add_btn(u, r, G_WP, i);
    }
    y += ph + 30;
    y = choice_row(s, u, y, L(STR_WALLPAPER_AUTO), G_WP_AUTO, !d->wallpaper_auto, L(STR_YES), L(STR_NO));

    y = section(s, y + 6, L(STR_PRIVACY));
    gfx_text(s, PAD + 8, y + 2, L(STR_PRIVACY_TEXT), C_TEXT);
}

static void settings_event(struct window *w, const struct wm_event *ev)
{
    struct settings_ui *u = w->data;
    struct desktop_settings *d = desktop_settings();
    switch (ev->type) {
    case WM_MOUSE_DOWN:
        if (ev->button != 1) break;
        for (int i = 0; i < u->nbtn; i++) {
            if (!rect_contains(u->btn[i].r, ev->x, ev->y))
                continue;
            int v = u->btn[i].value;
            switch (u->btn[i].group) {
            case G_LANG:
                lang_set(v ? LANG_EN : LANG_FR);
                desktop_lang_changed();
                break;
            case G_POS:   d->taskbar_top = v;        desktop_settings_changed(); break;
            case G_ALIGN: d->taskbar_left_align = v; desktop_settings_changed(); break;
            case G_CLOCK: d->show_clock = !v;        desktop_settings_changed(); break;
            case G_WP:
                d->wallpaper_auto = false;
                desktop_set_wallpaper(v);
                break;
            case G_WP_AUTO: d->wallpaper_auto = !v; break;
            }
            wm_invalidate(w);
            break;
        }
        break;
    case WM_LANG:
        wm_set_title(w, L(STR_SETTINGS));
        break;
    case WM_CLOSE:
        kfree(u);
        break;
    default:
        break;
    }
}

void app_open_settings(void)
{
    struct window *ex = wm_find_icon(ICON_SETTINGS);
    if (ex) { wm_focus(ex); return; }
    struct settings_ui *u = kmalloc(sizeof(*u));
    if (!u) return;
    u->nbtn = 0;
    struct rect wa = wm_workarea();
    struct window *w = wm_create(L(STR_SETTINGS), wa.x + 200, wa.y + 30, 540, 600,
                                 ICON_SETTINGS, settings_paint, settings_event, u);
    if (!w) kfree(u);
}

/* ==========================================================================
 * Gestionnaire des taches
 * ======================================================================== */
#define TM_MAX 32

static const char *state_name(enum thread_state st)
{
    switch (st) {
    case THREAD_READY:    return L(STR_STATE_READY);
    case THREAD_RUNNING:  return L(STR_STATE_RUNNING);
    case THREAD_SLEEPING: return L(STR_STATE_SLEEPING);
    default:              return L(STR_STATE_ZOMBIE);
    }
}

static void taskmgr_paint(struct window *w)
{
    struct surface *s = w->content;
    clear_content(w, C_WINDOW);
    struct thread snap[TM_MAX];
    u32 n = thread_snapshot(snap, TM_MAX);

    /* resume */
    int y = PAD;
    gfx_text(s, PAD, y, L(STR_TM_THREADS), C_TEXT_DIM);
    draw_num(s, PAD + 130, y, n, C_TEXT);
    gfx_text(s, PAD + 220, y, L(STR_TM_MEMORY), C_TEXT_DIM);
    char b[16];
    u32 used_kb = heap_used_bytes() / 1024, total_kb = memory_total_usable_kb();
    int x = PAD + 330;
    gfx_text(s, x, y, utoa(used_kb, b, 10), C_TEXT);      x += gfx_text_width(b);
    gfx_text(s, x, y, " / ", C_TEXT_DIM);                  x += gfx_text_width(" / ");
    gfx_text(s, x, y, utoa(total_kb, b, 10), C_TEXT);     x += gfx_text_width(b);
    gfx_text(s, x, y, " KB", C_TEXT_DIM);
    y += ROW;
    gfx_text(s, PAD, y, L(STR_TM_UPTIME), C_TEXT_DIM);
    u32 secs = timer_ticks() / TIMER_HZ;
    x = PAD + 130;
    gfx_text(s, x, y, utoa(secs / 3600, b, 10), C_TEXT); x += gfx_text_width(b);
    gfx_text(s, x, y, "h ", C_TEXT); x += gfx_text_width("h ");
    gfx_text(s, x, y, utoa((secs / 60) % 60, b, 10), C_TEXT); x += gfx_text_width(b);
    gfx_text(s, x, y, "m ", C_TEXT); x += gfx_text_width("m ");
    gfx_text(s, x, y, utoa(secs % 60, b, 10), C_TEXT); x += gfx_text_width(b);
    gfx_text(s, x, y, "s", C_TEXT);
    y += ROW + 4;

    /* barre memoire */
    struct rect bar = { PAD, y, s->w - 2 * PAD, 10 };
    gfx_fill_rounded(s, bar, 5, RGB(218, 221, 230));
    int fill = total_kb ? (int)((u32)bar.w * (used_kb > total_kb ? total_kb : used_kb) / total_kb) : 0;
    if (fill > 0) gfx_fill_rounded(s, (struct rect){ bar.x, bar.y, fill < 10 ? 10 : fill, bar.h }, 5, C_ACCENT);
    y += 24;

    /* tableau */
    gfx_fill(s, (struct rect){ 0, y - 4, s->w, FONT_H + 8 }, C_WINDOW_ALT);
    gfx_text(s, PAD, y, L(STR_TM_HEADER), C_TEXT_DIM);
    y += FONT_H + 10;
    for (u32 i = 0; i < n && y + FONT_H < s->h; i++) {
        struct thread *t = &snap[i];
        char line[96];
        int p = 0;
        utoa(t->id, b, 10);
        for (int k = (int)strlen(b); k < 3; k++) line[p++] = ' ';
        for (const char *c = b; *c; c++) line[p++] = *c;
        line[p++] = ' '; line[p++] = ' ';
        const char *st = state_name(t->state);
        int k = 0;
        for (; st[k] && k < 10; k++) line[p++] = st[k];
        for (; k < 11; k++) line[p++] = ' ';
        utoa(t->run_ticks * (1000 / TIMER_HZ), b, 10);
        for (k = (int)strlen(b); k < 7; k++) line[p++] = ' ';
        for (const char *c = b; *c; c++) line[p++] = *c;
        line[p++] = ' '; line[p++] = ' ';
        const char *mode = t->proc ? L(STR_USER) : L(STR_KERNEL);
        for (k = 0; mode[k] && k < 7; k++) line[p++] = mode[k];
        for (; k < 8; k++) line[p++] = ' ';
        for (k = 0; t->name[k] && k < THREAD_NAME_MAX && p < 94; k++) line[p++] = t->name[k];
        line[p] = '\0';
        if (i & 1)
            gfx_fill(s, (struct rect){ 0, y - 3, s->w, FONT_H + 6 }, RGB(248, 249, 252));
        gfx_text(s, PAD, y, line, C_TEXT);
        y += FONT_H + 6;
    }
}

static void taskmgr_event(struct window *w, const struct wm_event *ev)
{
    if (ev->type == WM_TICK) wm_invalidate(w);
    if (ev->type == WM_LANG) wm_set_title(w, L(STR_TASKMGR));
}

void app_open_taskmgr(void)
{
    struct window *ex = wm_find_icon(ICON_TASKMGR);
    if (ex) { wm_focus(ex); return; }
    struct rect wa = wm_workarea();
    wm_create(L(STR_TASKMGR), wa.x + 240, wa.y + 80, 560, 420,
              ICON_TASKMGR, taskmgr_paint, taskmgr_event, NULL);
}

/* ==========================================================================
 * A propos
 * ======================================================================== */
#define NOX_VERSION_STR "0.4"
#define NOX_EDITION     "Nox Aurora"

static void about_paint(struct window *w)
{
    struct surface *s = w->content;
    clear_content(w, C_WINDOW);
    int size;
    const u32 *logo = wm_logo(&size);
    int cx = s->w / 2, y = PAD + 4;
    if (logo) {
        gfx_draw_rgba_scaled(s, cx - 48, y, 96, 96, size, size, logo);
    } else {
        wm_draw_icon(s, cx - 48, y, 96, ICON_NOX);
    }
    y += 110;
    const char *name = "NoxOS";
    gfx_text(s, cx - gfx_text_width(name) / 2, y, name, C_TEXT); y += FONT_H + 4;
    gfx_text(s, cx - gfx_text_width(NOX_EDITION) / 2, y, NOX_EDITION, C_ACCENT_DARK); y += FONT_H + 4;
    char line[48];
    int p = 0;
    for (const char *c = L(STR_VERSION); *c; c++) line[p++] = *c;
    line[p++] = ' ';
    for (const char *c = NOX_VERSION_STR; *c; c++) line[p++] = *c;
    line[p] = '\0';
    gfx_text(s, cx - gfx_text_width(line) / 2, y, line, C_TEXT_DIM); y += FONT_H + 16;
    const char *t1 = L(STR_ABOUT_TEXT1), *t2 = L(STR_ABOUT_TEXT2), *t3 = L(STR_ABOUT_TEXT3);
    gfx_text(s, cx - gfx_text_width(t1) / 2, y, t1, C_TEXT); y += FONT_H + 4;
    gfx_text(s, cx - gfx_text_width(t2) / 2, y, t2, C_TEXT); y += FONT_H + 4;
    gfx_text(s, cx - gfx_text_width(t3) / 2, y, t3, C_TEXT); y += FONT_H + 4;
}

static void about_event(struct window *w, const struct wm_event *ev)
{
    if (ev->type == WM_LANG) wm_set_title(w, L(STR_ABOUT));
}

void app_open_about(void)
{
    struct window *ex = wm_find_icon(ICON_INFO);
    if (ex) { wm_focus(ex); return; }
    struct rect wa = wm_workarea();
    int w = 480, h = 330;
    wm_create(L(STR_ABOUT), wa.x + (wa.w - w) / 2, wa.y + (wa.h - h) / 2, w, h,
              ICON_INFO, about_paint, about_event, NULL);
}
