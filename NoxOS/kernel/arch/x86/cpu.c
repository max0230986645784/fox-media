/* NoxOS - CPUID, reboot, halt */
#include <nox/cpu.h>
#include <nox/io.h>
#include <nox/string.h>

static void cpuid(u32 leaf, u32 *a, u32 *b, u32 *c, u32 *d)
{
    __asm__ volatile("cpuid"
                     : "=a"(*a), "=b"(*b), "=c"(*c), "=d"(*d)
                     : "a"(leaf), "c"(0));
}

void cpu_detect(struct cpu_info *info)
{
    u32 a, b, c, d;

    memset(info, 0, sizeof(*info));

    /* Feuille 0 : vendeur (EBX, EDX, ECX dans cet ordre) */
    cpuid(0, &a, &b, &c, &d);
    u32 max_leaf = a;
    memcpy(info->vendor + 0, &b, 4);
    memcpy(info->vendor + 4, &d, 4);
    memcpy(info->vendor + 8, &c, 4);
    info->vendor[12] = '\0';

    if (max_leaf >= 1) {
        cpuid(1, &a, &b, &c, &d);
        info->stepping = a & 0xF;
        info->model    = (a >> 4) & 0xF;
        info->family   = (a >> 8) & 0xF;
        if (info->family == 0xF)
            info->family += (a >> 20) & 0xFF;
        if (info->family == 0x6 || info->family >= 0xF)
            info->model += ((a >> 16) & 0xF) << 4;

        info->has_fpu  = (d & (1u << 0)) != 0;
        info->has_pae  = (d & (1u << 6)) != 0;
        info->has_apic = (d & (1u << 9)) != 0;
        info->has_sse  = (d & (1u << 25)) != 0;
        info->has_sse2 = (d & (1u << 26)) != 0;
    }

    /* Feuilles etendues 0x80000002..4 : nom commercial */
    cpuid(0x80000000, &a, &b, &c, &d);
    if (a >= 0x80000004) {
        u32 *out = (u32 *)info->brand;
        for (u32 leaf = 0x80000002; leaf <= 0x80000004; leaf++) {
            cpuid(leaf, &a, &b, &c, &d);
            *out++ = a;
            *out++ = b;
            *out++ = c;
            *out++ = d;
        }
        info->brand[48] = '\0';
    } else {
        strcpy(info->brand, "(unknown)");
    }
}

void cpu_reboot(void)
{
    cli();
    /* Impulsion de reset via le controleur clavier 8042 (commande 0xFE). */
    while (inb(0x64) & 0x02)
        ;
    outb(0x64, 0xFE);
    for (;;)
        hlt();
}

void cpu_halt(void)
{
    cli();
    for (;;)
        hlt();
}
