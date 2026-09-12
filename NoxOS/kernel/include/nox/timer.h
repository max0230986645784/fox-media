/* NoxOS - horloge systeme (PIT 8253/8254, IRQ 0) */
#ifndef NOX_TIMER_H
#define NOX_TIMER_H

#include <nox/types.h>

#define TIMER_HZ 100    /* un tick toutes les 10 ms */

void timer_init(void);
u32  timer_ticks(void);
u32  timer_uptime_ms(void);

#endif
