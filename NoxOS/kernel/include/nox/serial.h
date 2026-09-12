/* NoxOS - port serie COM1 (utilise comme console de debug avec QEMU) */
#ifndef NOX_SERIAL_H
#define NOX_SERIAL_H

#include <nox/types.h>

void serial_init(void);
void serial_putc(char c);
void serial_puts(const char *s);
bool serial_has_char(void);
char serial_getc(void);

#endif
