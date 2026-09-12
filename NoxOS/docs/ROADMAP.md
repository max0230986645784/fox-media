# NoxOS — Roadmap

Chaque version doit **fonctionner et être testée** avant la suivante.

## v0.1 — Boot (fait)

- [x] bootloader 2 étages (MBR → mode protégé)
- [x] kernel minimal 32 bits, binaire plat à 0x10000
- [x] affichage VGA texte + console série
- [x] GDT, IDT, PIC, exceptions → panic
- [x] carte mémoire E820, allocateur kernel de base
- [x] timer PIT (100 Hz), clavier PS/2
- [x] shell `nox>` (help, clear, echo, version, cpu, memory, uptime, reboot, halt)
- [x] tests automatiques QEMU (`make test`)

## v0.2 — Mémoire et processus

- [ ] allocateur de pages physiques (bitmap sur la carte E820)
- [ ] pagination (mémoire virtuelle), kernel remappé
- [ ] `kmalloc`/`kfree` réels (tas kernel)
- [ ] processus + threads, contexte, ordonnanceur préemptif sur le timer
- [ ] pilote disque ATA (PIO) et premier système de fichiers NoxFS (lecture seule d'abord)

## v0.3 — Utilisateurs et sécurité de base

- [ ] mode utilisateur (ring 3), TSS, appels système
- [ ] séparation SYSTEM / USER dans le système de fichiers
- [ ] comptes, permissions, privilèges administrateur

## v0.4 — Graphique

- [ ] mode vidéo VESA/VBE (framebuffer)
- [ ] souris PS/2
- [ ] gestionnaire de fenêtres Nox Desktop (bureau, barre des tâches, menu Nox)

## v0.5 → v1.0

Voir le cahier des charges : explorateur, terminal complet, réseau,
gestionnaire de paquets, Nox Studio, SDK, installation, stabilisation.
