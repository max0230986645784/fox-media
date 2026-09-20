/* NoxOS - bus PCI : acces a l'espace de configuration (ports 0xCF8/0xCFC) */
#ifndef NOX_PCI_H
#define NOX_PCI_H

#include <nox/types.h>

struct pci_dev {
    u8  bus, slot, func;
    u16 vendor, device;
    u8  class_code, subclass;
    u32 bar[6];
    u8  irq;
};

u32  pci_read32(u8 bus, u8 slot, u8 func, u8 off);
u16  pci_read16(u8 bus, u8 slot, u8 func, u8 off);
void pci_write32(u8 bus, u8 slot, u8 func, u8 off, u32 val);
void pci_write16(u8 bus, u8 slot, u8 func, u8 off, u16 val);

/* Premier peripherique de la classe/sous-classe donnee ; false si absent. */
bool pci_find_class(u8 class_code, u8 subclass, struct pci_dev *out);
/* Active les bits "I/O space" et "bus master" du registre de commande. */
void pci_enable(const struct pci_dev *d);

#endif
