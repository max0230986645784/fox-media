/* echo - lit une ligne au clavier et la renvoie (test de SYS_READ) */
#include <nox.h>

int main(void)
{
    char line[64];
    puts("Tape quelque chose : ");
    readline(line, sizeof(line));
    puts("Tu as ecrit : \"");
    puts(line);
    puts("\"\n");
    return 0;
}
