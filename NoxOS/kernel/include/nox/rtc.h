/* NoxOS - horloge temps reel CMOS (ports 0x70/0x71) */
#ifndef NOX_RTC_H
#define NOX_RTC_H

#include <nox/types.h>

struct rtc_time {
    u8 second, minute, hour;
    u8 day, month;
    u16 year;
};

void rtc_read(struct rtc_time *t);

#endif
