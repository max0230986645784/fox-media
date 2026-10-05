<p align="center"><img src="assets/logo.png" alt="NoxOS" width="200"></p>

# NoxOS — Built from scratch.

NoxOS est un système d'exploitation desktop construit **de zéro** : propre
bootloader, propre kernel, sans base Linux.

**Version actuelle : v0.3** — bootloader + kernel 32 bits qui démarre dans
QEMU avec : mémoire virtuelle (pagination, tas kernel), threads préemptifs,
**disque ATA + système de fichiers NoxFS**, et **programmes utilisateur en
ring 3** avec espace d'adressage privé et appels système (`int 0x80`). Un
programme qui plante (page fault, instruction privilégiée) est tué, le
kernel continue.

```
BIOS -> boot/stage1 (MBR) -> boot/stage2 (mode protégé) -> kernel -> nox> run hello
                                                                        └─> ring 3
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
make test       # 29 tests automatiques (boot, mémoire, threads, disque, ring 3)
```

## Commandes du shell v0.3

`help` `clear` `echo` `version` `cpu` `memory` `frames` `uptime` `ps` `spawn [N]`
`heaptest` `disk` `ls [dir]` `cat <file>` `cd <dir>` `pwd` `run <prog> [&]`
`procs` `reboot` `halt`

- `disk` / `ls` / `cat` : disque ATA détecté, volume NoxFS monté, fichiers de `rootfs/`
- `run hello` : charge `/bin/hello` depuis NoxFS et l'exécute **en ring 3** ;
  le shell affiche son code de sortie. `run hello &` = en arrière-plan.
- `run crash` / `run privileged` : le programme écrit à l'adresse 0 / exécute
  `cli` → le kernel le tue proprement et rend sa mémoire (`frames` avant/après).
- `run echo` : lit une ligne au clavier via `SYS_READ` et la renvoie.
- `spawn 3` / `ps` : threads kernel de démo ; `procs` : processus utilisateur.

## Écrire un programme utilisateur

Un fichier `user/bin/monprog.c` suffit : il est compilé, lié à `0x40000000`
avec `user/user.ld` + `libnox` (`user/lib/`) et copié dans `/bin/` de l'image.

```c
#include <nox.h>              /* exit write read getpid yield sleep_ms uptime_ms puts putu */
int main(void) { puts("salut\n"); return 0; }
```

Les appels système (`kernel/include/nox/syscall.h`) : `SYS_EXIT SYS_WRITE
SYS_READ SYS_GETPID SYS_YIELD SYS_SLEEP SYS_UPTIME`. C'est la seule porte
entre un programme et le kernel.

## Organisation

```
NoxOS/
├── boot/           bootloader (stage1 MBR + stage2), assembleur NASM
├── kernel/
│   ├── arch/x86/   entrée, GDT+TSS, IDT, stubs d'interruption, PIC, CPUID, switch, passage ring 3
│   ├── core/       kmain, kprintf/panic, shell
│   ├── drivers/    VGA texte, série COM1, clavier PS/2, timer PIT, disque ATA PIO
│   ├── fs/         NoxFS (lecture)
│   ├── mm/         E820, frames physiques (pmm), pagination + répertoires par processus, tas
│   ├── proc/       threads + ordonnanceur, processus ring 3, appels système
│   ├── lib/        memset/strcmp/itoa...
│   ├── include/nox/ en-têtes publics du kernel (dont syscall.h partagé avec le userland)
│   └── linker.ld
├── user/           userland : libnox (crt0, appels système), programmes de user/bin/
├── rootfs/         fichiers copiés tels quels dans l'image NoxFS (/etc, /home)
├── tools/          mknoxfs : construit l'image NoxFS sur la machine hôte
├── tests/          tests QEMU automatisés
├── docs/           architecture, décisions, roadmap
└── build/          (généré) objets, kernel.bin, noxos.img
```

Voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) pour le fonctionnement
détaillé du boot et du kernel, et [docs/ROADMAP.md](docs/ROADMAP.md) pour la
suite.
