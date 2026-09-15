/* NoxOS - Nox Desktop : demarrage, barre des taches, menu, parametres */
#ifndef NOX_DESKTOP_H
#define NOX_DESKTOP_H

#include <nox/types.h>
#include <nox/wm.h>

#define WALLPAPER_COUNT 3

struct desktop_settings {
    bool taskbar_top;
    bool taskbar_left_align;
    bool show_clock;
    int  wallpaper;                        /* 0..WALLPAPER_COUNT-1 */
    bool wallpaper_auto;                   /* change a chaque demarrage */
};

bool desktop_start(void);                  /* lance le thread "desktop" */
bool desktop_running(void);
struct desktop_settings *desktop_settings(void);
void desktop_settings_changed(void);       /* apres modification : re-layout */
void desktop_lang_changed(void);           /* previent toutes les fenetres */
void desktop_set_wallpaper(int index);     /* redessine le fond */
void desktop_paint_wallpaper_preview(struct surface *s, struct rect r, int index);

/* Applications v0.4 (fenetres kernel) : ouvre ou ramene au premier plan. */
void app_open_terminal(void);
void app_open_explorer(const char *path);
void app_open_settings(void);
void app_open_taskmgr(void);
void app_open_about(void);
void app_open_text(const char *path);

void desktop_shutdown(void);
void desktop_reboot(void);

#endif
