/* NoxOS - clavier PS/2 */
#ifndef NOX_KEYBOARD_H
#define NOX_KEYBOARD_H

#include <nox/types.h>

void keyboard_init(void);

/* Retourne true et remplit *c si un caractere est disponible (non bloquant). */
bool keyboard_poll(char *c);

/* Attend et retourne le prochain caractere (bloquant, CPU en hlt entre-temps). */
char keyboard_getc(void);

#endif
