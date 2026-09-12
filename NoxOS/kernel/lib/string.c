#include <nox/string.h>

void *memset(void *dst, int value, size_t n)
{
    u8 *d = (u8 *)dst;
    while (n--)
        *d++ = (u8)value;
    return dst;
}

void *memcpy(void *dst, const void *src, size_t n)
{
    u8 *d = (u8 *)dst;
    const u8 *s = (const u8 *)src;
    while (n--)
        *d++ = *s++;
    return dst;
}

int memcmp(const void *a, const void *b, size_t n)
{
    const u8 *pa = (const u8 *)a;
    const u8 *pb = (const u8 *)b;
    for (size_t i = 0; i < n; i++) {
        if (pa[i] != pb[i])
            return pa[i] - pb[i];
    }
    return 0;
}

size_t strlen(const char *s)
{
    size_t n = 0;
    while (s[n])
        n++;
    return n;
}

int strcmp(const char *a, const char *b)
{
    while (*a && *a == *b) {
        a++;
        b++;
    }
    return (u8)*a - (u8)*b;
}

int strncmp(const char *a, const char *b, size_t n)
{
    while (n && *a && *a == *b) {
        a++;
        b++;
        n--;
    }
    if (n == 0)
        return 0;
    return (u8)*a - (u8)*b;
}

char *strcpy(char *dst, const char *src)
{
    char *d = dst;
    while ((*d++ = *src++))
        ;
    return dst;
}

char *utoa(u32 value, char *buf, int base)
{
    static const char digits[] = "0123456789abcdef";
    char tmp[33];
    int i = 0;

    if (base < 2 || base > 16)
        base = 10;

    do {
        tmp[i++] = digits[value % (u32)base];
        value /= (u32)base;
    } while (value);

    int j = 0;
    while (i > 0)
        buf[j++] = tmp[--i];
    buf[j] = '\0';
    return buf;
}

char *itoa(i32 value, char *buf)
{
    if (value < 0) {
        buf[0] = '-';
        utoa((u32)(-value), buf + 1, 10);
        return buf;
    }
    return utoa((u32)value, buf, 10);
}
