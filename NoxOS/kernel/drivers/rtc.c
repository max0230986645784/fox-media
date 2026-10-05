/* NoxOS - lecture de l'horloge CMOS
 *
 * On attend la fin d'une mise a jour (registre A bit 7), on lit deux fois
 * jusqu'a obtenir des valeurs identiques, puis on convertit le BCD et le
 * format 12 h si le registre B l'indique. L'heure est celle du BIOS (UTC
 * sous QEMU par defaut) : le fuseau viendra avec les parametres systeme.
 */
#include <nox/rtc.h>
#include <nox/io.h>

static u8 cmos(u8 reg)
{
    outb(0x70, reg);
    return inb(0x71);
}

static void read_raw(struct rtc_time *t)
{
    while (cmos(0x0A) & 0x80)
        ;
    t->second = cmos(0x00);
    t->minute = cmos(0x02);
    t->hour   = cmos(0x04);
    t->day    = cmos(0x07);
    t->month  = cmos(0x08);
    t->year   = cmos(0x09);
}

static u8 bcd(u8 v) { return (u8)((v & 0x0F) + (v >> 4) * 10); }

void rtc_read(struct rtc_time *t)
{
    struct rtc_time a, b;
    do {
        read_raw(&a);
        read_raw(&b);
    } while (a.second != b.second || a.minute != b.minute || a.hour != b.hour);

    u8 regb = cmos(0x0B);
    bool pm = a.hour & 0x80;
    a.hour &= 0x7F;
    if (!(regb & 0x04)) {
        a.second = bcd(a.second); a.minute = bcd(a.minute); a.hour = bcd(a.hour);
        a.day = bcd(a.day); a.month = bcd(a.month); a.year = bcd((u8)a.year);
    }
    if (!(regb & 0x02)) {                 /* mode 12 h */
        if (pm && a.hour < 12) a.hour = (u8)(a.hour + 12);
        if (!pm && a.hour == 12) a.hour = 0;
    }
    a.year = (u16)(2000 + a.year);
    *t = a;
}
