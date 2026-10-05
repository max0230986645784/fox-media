/* NoxOS - fonctions memoire / chaines minimales */
#ifndef NOX_STRING_H
#define NOX_STRING_H

#include <nox/types.h>

void  *memset(void *dst, int value, size_t n);
void  *memcpy(void *dst, const void *src, size_t n);
void  *memmove(void *dst, const void *src, size_t n);
char  *strncpy(char *dst, const char *src, size_t n);
char  *strchr(const char *s, int c);
char  *strrchr(const char *s, int c);
int    memcmp(const void *a, const void *b, size_t n);
size_t strlen(const char *s);
int    strcmp(const char *a, const char *b);
int    strncmp(const char *a, const char *b, size_t n);
char  *strcpy(char *dst, const char *src);

/* Convertit un entier en chaine dans buf (base 10 ou 16). Retourne buf. */
char *utoa(u32 value, char *buf, int base);
char *itoa(i32 value, char *buf);

#endif
