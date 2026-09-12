/* NoxOS - controleur d'interruptions programmable 8259A (PIC) */
#ifndef NOX_PIC_H
#define NOX_PIC_H

#include <nox/types.h>

void pic_init(void);
void pic_send_eoi(u8 irq);
void pic_mask(u8 irq);
void pic_unmask(u8 irq);

#endif
