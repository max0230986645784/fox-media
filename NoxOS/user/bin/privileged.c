/* privileged - tente `cli` puis `in` : interdit en ring 3 -> GPF -> tue */
#include <nox.h>

int main(void)
{
    puts("privileged: tentative de cli...\n");
    __asm__ volatile("cli");
    puts("privileged: ERREUR, cli a reussi\n");
    return 1;
}
