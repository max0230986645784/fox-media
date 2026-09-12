/* NoxOS - PIT (Programmable Interval Timer)
 *
 * Le PIT oscille a 1 193 182 Hz. On programme le canal 0 pour qu'il leve
 * l'IRQ 0 a TIMER_HZ ; le compteur de ticks servira plus tard a
 * l'ordonnanceur (multitache, v0.2). Pour l'instant : uptime.
 */
#include <nox/timer.h>
#include <nox/idt.h>
#include <nox/pic.h>
#include <nox/io.h>

#define PIT_CHANNEL0 0x40
#define PIT_COMMAND  0x43
#define PIT_BASE_HZ  1193182u

static volatile u32 ticks;

static void timer_irq(struct registers *regs)
{
    (void)regs;
    ticks++;
}

void timer_init(void)
{
    u32 divisor = PIT_BASE_HZ / TIMER_HZ;

    irq_register_handler(IRQ_TIMER, timer_irq);

    outb(PIT_COMMAND, 0x36);                    /* canal 0, lobyte/hibyte, mode 3 (onde carree) */
    outb(PIT_CHANNEL0, (u8)(divisor & 0xFF));
    outb(PIT_CHANNEL0, (u8)((divisor >> 8) & 0xFF));

    pic_unmask(IRQ_TIMER);
}

u32 timer_ticks(void)
{
    return ticks;
}

u32 timer_uptime_ms(void)
{
    return ticks * (1000 / TIMER_HZ);
}
