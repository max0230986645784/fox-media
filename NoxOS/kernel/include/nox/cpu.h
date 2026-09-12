/* NoxOS - informations processeur (CPUID) et controle machine */
#ifndef NOX_CPU_H
#define NOX_CPU_H

#include <nox/types.h>

struct cpu_info {
    char vendor[13];
    char brand[49];
    u32  family;
    u32  model;
    u32  stepping;
    bool has_fpu, has_sse, has_sse2, has_apic, has_pae;
};

void cpu_detect(struct cpu_info *info);
void cpu_reboot(void) __attribute__((noreturn));
void cpu_halt(void) __attribute__((noreturn));

#endif
