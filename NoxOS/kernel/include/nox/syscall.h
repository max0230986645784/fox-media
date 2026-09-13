/* NoxOS - interface des appels systeme (partagee kernel / userland)
 *
 * Convention (int 0x80) :
 *   eax = numero d'appel, ebx/ecx/edx = arguments 1..3, resultat dans eax.
 *   Un resultat negatif est un code d'erreur (-NOX_E*).
 *
 * C'est la SEULE porte d'entree du userland vers le kernel. Toute adresse
 * passee par un programme est verifiee avant usage (voir syscall.c).
 */
#ifndef NOX_SYSCALL_H
#define NOX_SYSCALL_H

#define SYS_EXIT      0   /* (code)                       ne revient jamais   */
#define SYS_WRITE     1   /* (fd, buf, len) -> ecrits     fd 1 = console      */
#define SYS_READ      2   /* (fd, buf, len) -> lus        fd 0 = clavier      */
#define SYS_GETPID    3   /* () -> pid                                        */
#define SYS_YIELD     4   /* ()                                               */
#define SYS_SLEEP     5   /* (ms)                                             */
#define SYS_UPTIME    6   /* () -> millisecondes depuis le demarrage          */
#define SYS_MAX       7

#define NOX_EINVAL    1   /* argument invalide             */
#define NOX_EFAULT    2   /* adresse hors espace utilisateur */
#define NOX_ENOSYS    3   /* appel inexistant              */

#ifdef __KERNEL__
#include <nox/idt.h>
void syscall_dispatch(struct registers *regs);
#endif

#endif
