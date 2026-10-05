/* NoxOS - Nox Desktop : gestionnaire de fenetres et compositeur
 *
 * v0.4 : le bureau tourne dans un thread kernel ("desktop"). Les applications
 * de cette version (terminal, explorateur, parametres, gestionnaire des
 * taches) sont des fenetres kernel dessinees via ces API. Les applications
 * userland (ring 3) passeront par des appels systeme graphiques en v0.5 ;
 * le decoupage fenetre/contenu/evenements est concu pour ce passage.
 *
 * Coordonnees : frame = rectangle ecran de la fenetre (barre de titre
 * comprise). content = surface du client, de taille frame.w x (frame.h -
 * WM_TITLE_H). Les evenements souris recus par la fenetre sont relatifs au
 * contenu.
 */
#ifndef NOX_WM_H
#define NOX_WM_H

#include <nox/types.h>
#include <nox/gfx.h>

#define WM_TITLE_H     30
#define WM_TITLE_MAX   48
#define WM_RADIUS      8

enum wm_event_type {
    WM_MOUSE_DOWN, WM_MOUSE_UP, WM_MOUSE_MOVE, WM_MOUSE_DBLCLICK,
    WM_KEY,             /* key = caractere ASCII/Latin-1 ou WM_KEY_* */
    WM_TICK,            /* environ 2 fois par seconde */
    WM_LANG,            /* la langue a change : re-traduire */
    WM_CLOSE,           /* la fenetre va etre detruite */
};

struct wm_event {
    enum wm_event_type type;
    int x, y;
    u32 button;
    char key;
};

enum app_icon {
    ICON_NOX, ICON_EXPLORER, ICON_TERMINAL, ICON_SETTINGS, ICON_TASKMGR,
    ICON_TEXT, ICON_FOLDER, ICON_FILE, ICON_HOME, ICON_IMAGE, ICON_MUSIC,
    ICON_VIDEO, ICON_DOWNLOAD, ICON_INFO, ICON_POWER, ICON_COUNT
};

struct window;
typedef void (*wm_paint_fn)(struct window *w);
typedef void (*wm_event_fn)(struct window *w, const struct wm_event *ev);

struct window {
    struct rect      frame;
    char             title[WM_TITLE_MAX];
    struct surface  *content;
    wm_paint_fn      paint;
    wm_event_fn      event;
    void            *data;
    enum app_icon    icon;
    bool             dirty;
    bool             popup;         /* sans barre de titre, ferme au clic exterieur */
    struct window   *next;          /* ordre Z : la queue de liste est au premier plan */
};

struct window *wm_create(const char *title, int x, int y, int w, int h,
                         enum app_icon icon, wm_paint_fn paint, wm_event_fn event,
                         void *data);
void   wm_destroy(struct window *w);
void   wm_focus(struct window *w);
void   wm_invalidate(struct window *w);
void   wm_set_title(struct window *w, const char *title);
struct window *wm_focused(void);
struct window *wm_first(void);                 /* parcours via ->next */
struct window *wm_find_icon(enum app_icon icon);
int    wm_screen_w(void);
int    wm_screen_h(void);
struct rect wm_workarea(void);                  /* ecran moins la barre des taches */

/* Icones vectorielles 32x32 (ou size) dessinees par le kernel. */
void   wm_draw_icon(struct surface *s, int x, int y, int size, enum app_icon icon);
/* Bouton plat : renvoie true si (mx,my) est dedans (pour le survol). */
void   wm_draw_button(struct surface *s, struct rect r, const char *label, bool active);
const u32 *wm_logo(int *size);                  /* /sys/logo.rgba charge, NULL sinon */

/* Theme */
#define C_BG_DARK     RGB(18, 20, 26)
#define C_PANEL       RGBA(28, 30, 38, 215)
#define C_WINDOW      RGB(244, 245, 248)
#define C_WINDOW_ALT  RGB(232, 234, 240)
#define C_TITLE       RGB(236, 237, 242)
#define C_TITLE_INACT RGB(222, 223, 228)
#define C_TEXT        RGB(24, 26, 32)
#define C_TEXT_DIM    RGB(110, 114, 126)
#define C_TEXT_LIGHT  RGB(240, 240, 245)
#define C_ACCENT      RGB(86, 120, 255)
#define C_ACCENT_DARK RGB(60, 88, 210)
#define C_BORDER      RGBA(0, 0, 0, 90)
#define C_SHADOW      RGBA(0, 0, 0, 70)
#define C_TERM_BG     RGB(20, 22, 28)
#define C_TERM_FG     RGB(212, 214, 222)
#define C_SELECT      RGBA(86, 120, 255, 70)

#endif
