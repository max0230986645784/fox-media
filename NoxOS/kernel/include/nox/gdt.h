/* NoxOS - Global Descriptor Table + TSS */
#ifndef NOX_GDT_H
#define NOX_GDT_H

#include <nox/types.h>

#define GDT_KERNEL_CODE 0x08
#define GDT_KERNEL_DATA 0x10
#define GDT_USER_CODE   0x18
#define GDT_USER_DATA   0x20
#define GDT_TSS         0x28

/* Selecteurs avec RPL=3 tels qu'ils apparaissent dans CS/SS en ring 3. */
#define USER_CS (GDT_USER_CODE | 3)
#define USER_DS (GDT_USER_DATA | 3)

void gdt_init(void);
/* Pile kernel utilisee par le CPU lors d'une interruption venant du ring 3.
 * L'ordonnanceur l'appelle a chaque changement de thread. */
void tss_set_kernel_stack(u32 esp0);

#endif
