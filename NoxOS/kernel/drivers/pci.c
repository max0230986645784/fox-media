/* NoxOS - bus PCI (mecanisme de configuration n.1) */
#include <nox/pci.h>
#include <nox/io.h>

#define PCI_ADDR 0xCF8
#define PCI_DATA 0xCFC

static inline void outl(u16 port, u32 v) { __asm__ volatile("outl %0, %1" : : "a"(v), "Nd"(port)); }
static inline u32  inl(u16 port) { u32 v; __asm__ volatile("inl %1, %0" : "=a"(v) : "Nd"(port)); return v; }

static u32 addr(u8 bus, u8 slot, u8 func, u8 off)
{
    return 0x80000000u | ((u32)bus << 16) | ((u32)(slot & 31) << 11) |
           ((u32)(func & 7) << 8) | (off & 0xFC);
}

u32 pci_read32(u8 bus, u8 slot, u8 func, u8 off)
{
    outl(PCI_ADDR, addr(bus, slot, func, off));
    return inl(PCI_DATA);
}

u16 pci_read16(u8 bus, u8 slot, u8 func, u8 off)
{
    return (u16)(pci_read32(bus, slot, func, off) >> ((off & 2) * 8));
}

void pci_write32(u8 bus, u8 slot, u8 func, u8 off, u32 val)
{
    outl(PCI_ADDR, addr(bus, slot, func, off));
    outl(PCI_DATA, val);
}

void pci_write16(u8 bus, u8 slot, u8 func, u8 off, u16 val)
{
    u32 v = pci_read32(bus, slot, func, off);
    int sh = (off & 2) * 8;
    v = (v & ~(0xFFFFu << sh)) | ((u32)val << sh);
    pci_write32(bus, slot, func, off, v);
}

static bool fill(u8 bus, u8 slot, u8 func, struct pci_dev *d)
{
    u32 id = pci_read32(bus, slot, func, 0);
    if ((id & 0xFFFF) == 0xFFFF)
        return false;
    d->bus = bus; d->slot = slot; d->func = func;
    d->vendor = (u16)id; d->device = (u16)(id >> 16);
    u32 cls = pci_read32(bus, slot, func, 8);
    d->class_code = (u8)(cls >> 24); d->subclass = (u8)(cls >> 16);
    for (int i = 0; i < 6; i++)
        d->bar[i] = pci_read32(bus, slot, func, (u8)(0x10 + i * 4));
    d->irq = (u8)pci_read32(bus, slot, func, 0x3C);
    return true;
}

bool pci_find_class(u8 class_code, u8 subclass, struct pci_dev *out)
{
    for (int bus = 0; bus < 256; bus++)
        for (int slot = 0; slot < 32; slot++)
            for (int func = 0; func < 8; func++) {
                struct pci_dev d;
                if (!fill((u8)bus, (u8)slot, (u8)func, &d)) {
                    if (func == 0) break;
                    continue;
                }
                if (d.class_code == class_code && d.subclass == subclass) {
                    *out = d;
                    return true;
                }
                /* pas multi-fonction : inutile de tester les autres */
                if (func == 0 && !(pci_read32((u8)bus, (u8)slot, 0, 0x0C) & 0x00800000))
                    break;
            }
    return false;
}

void pci_enable(const struct pci_dev *d)
{
    u16 cmd = pci_read16(d->bus, d->slot, d->func, 4);
    pci_write16(d->bus, d->slot, d->func, 4, cmd | 0x0005);
}
