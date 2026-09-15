/* NoxOS - textes du bureau en francais (defaut) et anglais
 *
 * Aucune chaine visible n'est codee en dur dans le bureau : tout passe par
 * L(STR_xxx). La langue se change a chaud depuis Parametres.
 */
#ifndef NOX_LANG_H
#define NOX_LANG_H

#include <nox/types.h>

enum lang { LANG_FR = 0, LANG_EN = 1, LANG_COUNT };

enum str_id {
    STR_MENU,               /* "Menu" */
    STR_EXPLORER,
    STR_TERMINAL,
    STR_SETTINGS,
    STR_TASKMGR,
    STR_ABOUT,
    STR_SHUTDOWN,
    STR_REBOOT,
    STR_APPS,
    STR_SYSTEM,
    STR_SEARCH,             /* "Rechercher" */
    STR_SEARCH_HINT,        /* "Tapez pour chercher apps et fichiers" */
    STR_NO_RESULT,
    STR_FILES,
    STR_CLOSE,
    STR_HOME,
    STR_COMPUTER,
    STR_DOCUMENTS,
    STR_IMAGES,
    STR_MUSIC,
    STR_VIDEOS,
    STR_DOWNLOADS,
    STR_FOLDER,
    STR_FILE,
    STR_ITEMS,
    STR_EMPTY_FOLDER,
    STR_NO_DISK,
    STR_NEW_FOLDER,
    STR_READ_ONLY_HINT,
    STR_LANGUAGE,
    STR_FRENCH,
    STR_ENGLISH,
    STR_TASKBAR,
    STR_TASKBAR_POS,
    STR_BOTTOM,
    STR_TOP,
    STR_TASKBAR_ALIGN,
    STR_CENTER,
    STR_LEFT,
    STR_SHOW_CLOCK,
    STR_YES,
    STR_NO,
    STR_PRIVACY,
    STR_PRIVACY_TEXT,
    STR_ABOUT_TEXT1,
    STR_ABOUT_TEXT2,
    STR_ABOUT_TEXT3,
    STR_TM_HEADER,
    STR_TM_THREADS,
    STR_TM_MEMORY,
    STR_TM_UPTIME,
    STR_STATE_READY,
    STR_STATE_RUNNING,
    STR_STATE_SLEEPING,
    STR_STATE_ZOMBIE,
    STR_KERNEL,
    STR_USER,
    STR_TERMINAL_HINT,
    STR_TEXT_VIEWER,
    STR_WALLPAPER,
    STR_WALLPAPER_AUTO,
    STR_WP_NIGHT,
    STR_WP_AURORA,
    STR_WP_FOREST,
    STR_VERSION,
    STR_LINES,
    STR_SCROLL_HINT,
    STR_COUNT
};

void        lang_set(enum lang l);
enum lang   lang_get(void);
const char *L(enum str_id id);

#endif
