/* NoxOS userland - bibliotheque minimale (libnox)
 * Tout passe par int 0x80 (voir kernel/include/nox/syscall.h). Aucun acces
 * direct au materiel ou au kernel n'est possible depuis un programme.
 */
#ifndef NOX_USER_H
#define NOX_USER_H

#include <nox/types.h>
#include <nox/syscall.h>

void exit(int code) __attribute__((noreturn));
int  write(u32 fd, const void *buf, u32 len);
int  read(u32 fd, void *buf, u32 len);
u32  getpid(void);
void yield(void);
void sleep_ms(u32 ms);
u32  uptime_ms(void);

/* Aides sans appel systeme */
u32  strlen(const char *s);
void puts(const char *s);
void putu(u32 v);                 /* entier decimal */
void putx(u32 v);                 /* hexadecimal 0x... */
/* Lit une ligne (sans le \n final), renvoie sa longueur. */
u32  readline(char *buf, u32 cap);

#endif
