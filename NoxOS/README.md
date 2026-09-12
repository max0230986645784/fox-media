<p align="center"><img src="assets/logo.png" alt="NoxOS" width="200"></p>

# NoxOS — Built from scratch.

NoxOS est un système d'exploitation desktop construit **de zéro** : propre
bootloader, propre kernel, sans base Linux.

**Version actuelle : v0.1** — bootloader + kernel minimal 32 bits qui démarre
dans QEMU, affiche un message, détecte la mémoire, gère le clavier et propose
un shell `nox>`.

```
BIOS  ->  boot/stage1 (MBR)  ->  boot/stage2 (mode protégé)  ->  kernel  ->  nox>
```

## Prérequis (Linux)

```bash
sudo apt install build-essential nasm qemu-system-x86
```

## Compiler, lancer, tester

```bash
make            # construit build/noxos.img
make run        # QEMU avec fenêtre (VGA) + sortie série dans le terminal
make run-serial # QEMU sans fenêtre : le shell est dans ton terminal (Ctrl+A puis X pour quitter)
make test       # tests automatiques (boot, clavier PS/2, commandes du shell)
```

## Commandes du shell v0.1

`help` `clear` `echo` `version` `cpu` `memory` `uptime` `reboot` `halt`

## Organisation

```
NoxOS/
├── boot/           bootloader (stage1 MBR + stage2), assembleur NASM
├── kernel/
│   ├── arch/x86/   entrée, GDT, IDT, stubs d'interruption, PIC, CPUID
│   ├── core/       kmain, kprintf/panic, shell
│   ├── drivers/    VGA texte, série COM1, clavier PS/2, timer PIT
│   ├── mm/         carte mémoire E820 + allocateur kernel
│   ├── lib/        memset/strcmp/itoa...
│   ├── include/nox/ en-têtes publics du kernel
│   └── linker.ld
├── tests/          tests QEMU automatisés
├── docs/           architecture, décisions, roadmap
└── build/          (généré) objets, kernel.bin, noxos.img
```

Voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) pour le fonctionnement
détaillé du boot et du kernel, et [docs/ROADMAP.md](docs/ROADMAP.md) pour la
suite.
