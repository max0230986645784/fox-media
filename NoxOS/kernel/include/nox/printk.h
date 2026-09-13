/* NoxOS - sortie console du kernel (VGA + serie) */
#ifndef NOX_PRINTK_H
#define NOX_PRINTK_H

#include <nox/types.h>

void kputc(char c);
void kputs(const char *s);
/* Attend un caractere du clavier PS/2 ou du port serie (bloquant). */
char console_getc(void);

/* printf minimal : %s %c %d %u %x %p %% */
void kprintf(const char *fmt, ...);

/* Affiche un message d'erreur fatal et arrete la machine. */
void panic(const char *fmt, ...) __attribute__((noreturn));

#endif
