/* hello - premier programme NoxOS en ring 3 */
#include <nox.h>

static int counter;              /* .bss : doit etre a zero au demarrage */

int main(void)
{
    puts("Bonjour depuis le ring 3 ! pid=");
    putu(getpid());
    puts(" uptime=");
    putu(uptime_ms());
    puts("ms counter=");
    putu((u32)counter);
    puts("\n");

    for (int i = 0; i < 3; i++) {
        counter++;
        puts("  hello: tick ");
        putu((u32)counter);
        puts("\n");
        sleep_ms(100);
    }
    return 42;
}
