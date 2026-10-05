/* NoxOS - pilote disque ATA (PIO, LBA28, bus primaire) */
#ifndef NOX_ATA_H
#define NOX_ATA_H

#include <nox/types.h>

#define ATA_SECTOR_SIZE 512u

bool ata_init(void);                                    /* false : aucun disque */
bool ata_read(u32 lba, u32 count, void *buf);
bool ata_write(u32 lba, u32 count, const void *buf);
u32  ata_sector_count(void);
const char *ata_model(void);

#endif
