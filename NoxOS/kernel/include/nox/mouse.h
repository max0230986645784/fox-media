/* NoxOS - souris PS/2 (voir drivers/mouse.c) */
#ifndef NOX_MOUSE_H
#define NOX_MOUSE_H

#include <nox/types.h>

#define MOUSE_LEFT   0x1u
#define MOUSE_RIGHT  0x2u
#define MOUSE_MIDDLE 0x4u

enum mouse_event_type { MOUSE_MOVE, MOUSE_DOWN, MOUSE_UP };

struct mouse_event {
    enum mouse_event_type type;
    int x, y;
    u32 button;        /* bouton concerne (DOWN/UP), 0 pour MOVE */
    u32 buttons;       /* etat de tous les boutons apres l'evenement */
};

bool mouse_init(int screen_w, int screen_h);
bool mouse_present(void);
void mouse_state(int *x, int *y, u32 *buttons);
bool mouse_poll_event(struct mouse_event *ev);

#endif
