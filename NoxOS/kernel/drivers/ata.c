/* NoxOS - pilote ATA PIO (disque IDE primaire maitre)
 *
 * Mode le plus simple qui existe : on ecrit la commande et l'adresse LBA
 * dans les ports 0x1F0-0x1F7, on attend que le disque soit pret (polling
 * du registre de statut), puis on transfere 256 mots de 16 bits par secteur.
 * Pas d'interruption, pas de DMA : lent mais suffisant pour lire NoxFS
 * (quelques centaines de Ko) et parfaitement previsible dans QEMU.
 */
#include <nox/ata.h>
#include <nox/io.h>
#include <nox/printk.h>
#include <nox/string.h>

#define ATA_DATA        0x1F0
#define ATA_ERROR       0x1F1
#define ATA_SECCOUNT    0x1F2
#define ATA_LBA_LO      0x1F3
#define ATA_LBA_MID     0x1F4
#define ATA_LBA_HI      0x1F5
#define ATA_DRIVE       0x1F6
#define ATA_STATUS      0x1F7
#define ATA_COMMAND     0x1F7
#define ATA_CONTROL     0x3F6

#define ST_ERR  0x01
#define ST_DRQ  0x08
#define ST_DF   0x20
#define ST_BSY  0x80

#define CMD_READ      0x20
#define CMD_WRITE     0x30
#define CMD_FLUSH     0xE7
#define CMD_IDENTIFY  0xEC

static u32  sectors;
static char model[41];

static void io_wait_400ns(void)
{
    for (int i = 0; i < 4; i++)
        inb(ATA_CONTROL);
}

/* Attend BSY=0 puis (si want_drq) DRQ=1. Renvoie false sur erreur/timeout. */
static bool wait_ready(bool want_drq)
{
    for (u32 i = 0; i < 1000000; i++) {
        u8 st = inb(ATA_STATUS);
        if (st & (ST_ERR | ST_DF))
            return false;
        if (!(st & ST_BSY) && (!want_drq || (st & ST_DRQ)))
            return true;
    }
    return false;
}

static void select_lba(u32 lba, u8 count)
{
    outb(ATA_DRIVE, (u8)(0xE0 | ((lba >> 24) & 0x0F)));   /* maitre, mode LBA */
    io_wait_400ns();
    outb(ATA_SECCOUNT, count);
    outb(ATA_LBA_LO,  (u8)lba);
    outb(ATA_LBA_MID, (u8)(lba >> 8));
    outb(ATA_LBA_HI,  (u8)(lba >> 16));
}

bool ata_init(void)
{
    sectors = 0;
    model[0] = '\0';

    outb(ATA_CONTROL, 0x02);                /* nIEN : pas d'IRQ, on interroge */
    outb(ATA_DRIVE, 0xA0);
    io_wait_400ns();
    outb(ATA_SECCOUNT, 0);
    outb(ATA_LBA_LO, 0);
    outb(ATA_LBA_MID, 0);
    outb(ATA_LBA_HI, 0);
    outb(ATA_COMMAND, CMD_IDENTIFY);
    io_wait_400ns();

    if (inb(ATA_STATUS) == 0)
        return false;                       /* aucun disque */
    if (!wait_ready(true))
        return false;

    u16 id[256];
    for (int i = 0; i < 256; i++)
        id[i] = inw(ATA_DATA);

    sectors = (u32)id[60] | ((u32)id[61] << 16);   /* nb secteurs LBA28 */
    for (int i = 0; i < 20; i++) {          /* modele : mots 27..46, octets inverses */
        model[i * 2]     = (char)(id[27 + i] >> 8);
        model[i * 2 + 1] = (char)(id[27 + i] & 0xFF);
    }
    model[40] = '\0';
    for (int i = 39; i >= 0 && model[i] == ' '; i--)
        model[i] = '\0';
    return true;
}

bool ata_read(u32 lba, u32 count, void *buf)
{
    u16 *p = buf;
    while (count) {
        u8 n = count > 255 ? 255 : (u8)count;
        if (!wait_ready(false))
            return false;
        select_lba(lba, n);
        outb(ATA_COMMAND, CMD_READ);
        for (u8 s = 0; s < n; s++) {
            if (!wait_ready(true))
                return false;
            for (int i = 0; i < 256; i++)
                *p++ = inw(ATA_DATA);
        }
        lba += n;
        count -= n;
    }
    return true;
}

bool ata_write(u32 lba, u32 count, const void *buf)
{
    const u16 *p = buf;
    while (count) {
        u8 n = count > 255 ? 255 : (u8)count;
        if (!wait_ready(false))
            return false;
        select_lba(lba, n);
        outb(ATA_COMMAND, CMD_WRITE);
        for (u8 s = 0; s < n; s++) {
            if (!wait_ready(true))
                return false;
            for (int i = 0; i < 256; i++)
                outw(ATA_DATA, *p++);
        }
        outb(ATA_COMMAND, CMD_FLUSH);
        if (!wait_ready(false))
            return false;
        lba += n;
        count -= n;
    }
    return true;
}

u32 ata_sector_count(void) { return sectors; }
const char *ata_model(void) { return model; }
