/* NoxOS userland - libnox : enveloppes d'appels systeme et aides */
#include <nox.h>

static inline int syscall3(u32 nr, u32 a, u32 b, u32 c)
{
    int ret;
    __asm__ volatile("int $0x80"
                     : "=a"(ret)
                     : "a"(nr), "b"(a), "c"(b), "d"(c)
                     : "memory");
    return ret;
}

void exit(int code)
{
    syscall3(SYS_EXIT, (u32)code, 0, 0);
    for (;;)
        ;
}

int write(u32 fd, const void *buf, u32 len)
{
    return syscall3(SYS_WRITE, fd, (u32)buf, len);
}

int read(u32 fd, void *buf, u32 len)
{
    return syscall3(SYS_READ, fd, (u32)buf, len);
}

u32 getpid(void)
{
    return (u32)syscall3(SYS_GETPID, 0, 0, 0);
}

void yield(void)
{
    syscall3(SYS_YIELD, 0, 0, 0);
}

void sleep_ms(u32 ms)
{
    syscall3(SYS_SLEEP, ms, 0, 0);
}

u32 uptime_ms(void)
{
    return (u32)syscall3(SYS_UPTIME, 0, 0, 0);
}

u32 strlen(const char *s)
{
    u32 n = 0;
    while (s[n])
        n++;
    return n;
}

void puts(const char *s)
{
    write(1, s, strlen(s));
}

void putu(u32 v)
{
    char buf[11];
    int i = 10;
    buf[i] = '\0';
    do {
        buf[--i] = (char)('0' + v % 10);
        v /= 10;
    } while (v);
    puts(&buf[i]);
}

void putx(u32 v)
{
    char buf[11] = "0x";
    for (int i = 0; i < 8; i++)
        buf[2 + i] = "0123456789abcdef"[(v >> (28 - 4 * i)) & 0xF];
    buf[10] = '\0';
    puts(buf);
}

u32 readline(char *buf, u32 cap)
{
    if (cap == 0)
        return 0;
    int n = read(0, buf, cap - 1);
    if (n < 0)
        n = 0;
    if (n > 0 && buf[n - 1] == '\n')
        n--;
    buf[n] = '\0';
    return (u32)n;
}
