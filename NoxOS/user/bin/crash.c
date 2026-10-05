/* crash - verifie que le kernel survit a un programme fautif.
 * Un ecrit hors de son espace (page fault), l'autre tente une instruction
 * privilegiee (GPF) : dans les deux cas seul le processus doit mourir. */
#include <nox.h>

int main(void)
{
    puts("crash: ecriture a l'adresse 0 dans 1 seconde...\n");
    sleep_ms(1000);
    *(volatile u32 *)0 = 0xDEAD;
    puts("crash: ERREUR, toujours vivant\n");
    return 1;
}
