/* NoxOS - Global Descriptor Table */
#ifndef NOX_GDT_H
#define NOX_GDT_H

#include <nox/types.h>

#define GDT_KERNEL_CODE 0x08
#define GDT_KERNEL_DATA 0x10

void gdt_init(void);

#endif
