/* NoxOS - dispatcher des appels systeme (int 0x80)
 *
 * Arrive ici avec IF=0 (porte d'interruption) sur la pile kernel du thread.
 * On reactive les interruptions : un appel peut bloquer (read, sleep) et le
 * thread doit pouvoir etre preempte pendant ce temps.
 *
 * Regle absolue : ne jamais deferencer un pointeur utilisateur sans l'avoir
 * verifie avec user_range_ok(). Les pages du processus sont accessibles
 * depuis le kernel (meme CR3), mais une adresse hors de son espace pointerait
 * dans le kernel lui-meme.
 */
#include <nox/syscall.h>
#include <nox/process.h>
#include <nox/thread.h>
#include <nox/printk.h>
#include <nox/timer.h>
#include <nox/io.h>

static int sys_write(u32 fd, const char *buf, u32 len)
{
    if (fd != 1 && fd != 2)
        return -NOX_EINVAL;
    if (!user_range_ok(buf, len))
        return -NOX_EFAULT;
    for (u32 i = 0; i < len; i++)
        kputc(buf[i]);
    return (int)len;
}

/* Lecture ligne : renvoie des que l'utilisateur valide (\n inclus) ou que
 * le tampon est plein. Echo et retour-arriere geres ici. */
static int sys_read(u32 fd, char *buf, u32 len)
{
    if (fd != 0)
        return -NOX_EINVAL;
    if (!user_range_ok(buf, len))
        return -NOX_EFAULT;
    u32 n = 0;
    while (n < len) {
        char c = console_getc();
        if (c == '\b') {
            if (n > 0) {
                n--;
                kputs("\b \b");
            }
            continue;
        }
        kputc(c);
        buf[n++] = c;
        if (c == '\n')
            break;
    }
    return (int)n;
}

void syscall_dispatch(struct registers *regs)
{
    sti();
    u32 nr = regs->eax, a = regs->ebx, b = regs->ecx, c = regs->edx;
    int ret;

    switch (nr) {
    case SYS_EXIT:
        process_exit((int)a);
    case SYS_WRITE:
        ret = sys_write(a, (const char *)b, c);
        break;
    case SYS_READ:
        ret = sys_read(a, (char *)b, c);
        break;
    case SYS_GETPID:
        ret = (int)process_current()->pid;
        break;
    case SYS_YIELD:
        thread_yield();
        ret = 0;
        break;
    case SYS_SLEEP:
        thread_sleep_ms(a);
        ret = 0;
        break;
    case SYS_UPTIME:
        ret = (int)(timer_ticks() * (1000 / TIMER_HZ));
        break;
    default:
        ret = -NOX_ENOSYS;
        break;
    }
    regs->eax = (u32)ret;
}
