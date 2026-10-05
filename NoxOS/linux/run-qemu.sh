#!/bin/bash
# Lance l'ISO Nox OS dans QEMU (BIOS par defaut ; UEFI avec NOX_UEFI=1).
ISO=${1:-noxos.iso}
EXTRA=()
[ -n "${NOX_UEFI:-}" ] && EXTRA+=(-bios /usr/share/ovmf/OVMF.fd)
exec qemu-system-x86_64 -enable-kvm -m 3072 -smp 2 -cdrom "$ISO" -boot d \
    -vga virtio -display gtk,gl=on -device intel-hda -device hda-duplex -usb -device usb-tablet "${EXTRA[@]}" "$@"
