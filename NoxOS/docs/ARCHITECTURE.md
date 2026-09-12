# NoxOS v0.2 — Architecture et fonctionnement

Ce document explique **ce qui se passe réellement** entre l'allumage de la
machine et l'apparition du prompt `nox>`. Rien n'est simulé : chaque étape
décrite correspond à du code présent dans le dépôt.

## 1. Vue d'ensemble

```
+-----------+   +------------------+   +-------------------+   +----------------+
| BIOS      |-->| boot/stage1.asm  |-->| boot/stage2.asm   |-->| kernel (C+asm) |
| (firmware)|   | 512 o, mode réel |   | E820, load kernel |   | 0x10000, 32 bit|
+-----------+   +------------------+   | A20, GDT, PM      |   +----------------+
                                       +-------------------+
```

L'image disque `build/noxos.img` est un simple enchaînement de secteurs de
512 octets :

| Secteur (LBA) | Contenu             | Chargé à       |
|---------------|---------------------|----------------|
| 0             | stage1 (MBR)        | 0x7C00 (BIOS)  |
| 1..4          | stage2              | 0x7E00         |
| 5..N          | kernel.bin (plat)   | 0x10000        |

Le reste de l'image est rempli de zéros jusqu'à 1,44 Mo.

## 2. Bootloader

### Stage 1 — `boot/stage1.asm` (512 octets)

Le BIOS charge le premier secteur du disque à `0x7C00` et y saute, en mode
réel 16 bits. Le stage 1 est limité à 510 octets + la signature `0xAA55`.
Il fait le minimum :

1. met en place les segments et une pile temporaire ;
2. mémorise le numéro de disque de boot fourni par le BIOS dans `DL` ;
3. lit les 4 secteurs du stage 2 (`INT 13h, AH=02h`, adressage CHS) à `0x7E00` ;
4. saute dessus.

Le nombre de secteurs du stage 2 (`STAGE2_SECTORS`) est fixé par le Makefile
et passé à NASM avec `-D`.

### Stage 2 — `boot/stage2.asm`

Toujours en mode réel, mais sans la contrainte des 512 octets :

1. **Carte mémoire E820** (`INT 15h, EAX=E820h`) : le BIOS énumère les zones
   de RAM (utilisable, réservée, ACPI…). Les entrées sont écrites à
   `0x9010`, le compteur à `0x9000`. C'est la structure `boot_info` lue plus
   tard par `kernel/mm/memory.c`.
2. **Chargement du kernel** avec `INT 13h, AH=42h` (lecture LBA étendue),
   par blocs de 32 secteurs, vers `0x1000:0000` = `0x10000`. Le nombre de
   secteurs (`KERNEL_SECTORS`) est calculé par le Makefile à partir de la
   taille réelle de `kernel.bin`.
3. **Ligne A20** : par défaut un PC ignore le bit 20 des adresses
   (compatibilité 8086). On l'active via le port `0x92` pour adresser au-delà
   de 1 Mo.
4. **GDT temporaire** : deux segments plats (code `0x08`, data `0x10`) de
   0 à 4 Go.
5. **Passage en mode protégé** : `CR0.PE = 1` puis un `jmp far` pour recharger
   `CS`. À partir d'ici le CPU exécute du code 32 bits.
6. Saut au kernel avec `EAX = 0x4E4F5831` (`"NOX1"`, magic) et
   `EBX = 0x9000` (adresse de `boot_info`).

## 3. Kernel

Le kernel est compilé en C freestanding (`-ffreestanding -nostdlib`, pas de
libc) + quelques fichiers NASM, lié par `kernel/linker.ld` à l'adresse
`0x10000`, puis converti en binaire plat avec `objcopy`.

### Entrée — `kernel/arch/x86/entry.asm`

Premier code exécuté (section `.text.entry`, placée en tête par le linker) :
installe une pile de 16 Ko, **met `.bss` à zéro** (le bootloader ne charge que
les octets présents dans le fichier, or les variables globales non
initialisées doivent valoir 0), puis appelle `kmain(magic, boot_info)`.

### `kmain` — `kernel/core/kmain.c`

Ordre d'initialisation, chaque étape dépendant de la précédente :

| Étape       | Fichier                     | Rôle |
|-------------|-----------------------------|------|
| serial, vga | `drivers/serial.c`, `drivers/vga.c` | pouvoir afficher (et paniquer proprement) |
| gdt         | `arch/x86/gdt.c`            | GDT du kernel, indépendante du bootloader ; segments ring 3 déjà prévus |
| pic, idt    | `arch/x86/pic.c`, `idt.c`, `isr.asm` | remappe les IRQ sur 32..47, installe 48 handlers |
| memory      | `mm/memory.c`               | copie la carte E820, calcule la RAM utilisable |
| pmm         | `mm/pmm.c`                  | allocateur de frames physiques (bitmap 4 Ko) |
| paging      | `mm/paging.c`               | répertoire + tables de pages, CR3, CR0.PG, handler de page fault |
| heap        | `mm/heap.c`                 | tas kernel virtuel `kmalloc`/`kfree` |
| timer       | `drivers/timer.c`           | PIT à 100 Hz sur IRQ 0 → uptime + `sched_tick()` |
| keyboard    | `drivers/keyboard.c`        | clavier PS/2 sur IRQ 1, tampon circulaire |
| scheduler   | `proc/thread.c`, `arch/x86/switch.asm` | `kmain` devient le thread `main`, thread `idle` créé |
| `sti`       |                             | interruptions autorisées → préemption active |
| shell       | `core/shell.c`              | boucle `nox>` |

### Interruptions

- `isr.asm` génère 32 stubs d'exceptions + 16 stubs d'IRQ. Chaque stub
  empile le numéro d'interruption (et un code d'erreur factice si le CPU n'en
  fournit pas), sauvegarde les registres et appelle `isr_dispatch()`.
- Exceptions (0..31) → handler enregistré via `isr_register_exception_handler()`
  (le page fault, vecteur 14, l'utilise), sinon `panic()` avec le nom de
  l'exception et `EIP`.
- IRQ (32..47) → EOI envoyé au PIC, puis handler enregistré par un pilote via
  `irq_register_handler()`. L'EOI est envoyé *avant* le handler car celui du
  timer peut changer de thread et ne « revenir » que bien plus tard.

### Mémoire (v0.2)

Trois couches, de la plus physique à la plus pratique :

1. **PMM — `mm/pmm.c`** : un bitmap de 1 bit par frame de 4 Ko (128 Ko pour
   couvrir 4 Go). Au démarrage tout est réservé, puis les zones E820
   `usable` sont libérées, et tout ce qui est sous 1 Mo est re-réservé
   (kernel, boot_info, VGA, BIOS). `pmm_alloc_frame()` renvoie une adresse
   physique de page mise à zéro ; `pmm_free_frame()` détecte les doubles
   libérations.
2. **Pagination — `mm/paging.c`** : pagination x86 classique à deux niveaux
   (répertoire de 1024 entrées → tables de 1024 pages). Toute la RAM est
   d'abord **identity-mappée** (virtuel = physique) pour que le kernel,
   chargé à `0x10000`, continue de fonctionner tel quel. Puis `CR3` est
   chargé et `CR0.PG` activé. Un accès à une page non mappée déclenche un
   page fault dont le handler affiche l'adresse (`CR2`), le type d'accès et
   `EIP` avant de paniquer.
3. **Tas — `mm/heap.c`** : le tas vit dans la zone **virtuelle**
   `0xD0000000..0xE0000000`, sans rapport avec la RAM physique. Quand il
   manque de place, `grow()` demande des frames au PMM et les mappe à la fin
   du tas : c'est le premier vrai usage de la pagination. Les blocs forment
   une liste doublement chaînée avec en-tête (magic, taille, libre) ;
   `kmalloc` = first-fit + découpe, `kfree` = fusion avec les voisins libres.
   `kmalloc_aligned()` sert aux futures structures alignées sur une page.
   `heap_check()` vérifie l'intégrité de la liste (commande `heaptest`).

### Threads et ordonnanceur (v0.2)

- `struct thread` (`include/nox/thread.h`) : `esp` sauvegardé, id, état
  (`READY / RUNNING / SLEEPING / ZOMBIE`), nom, pile de 16 Ko allouée par
  `kmalloc`. Tous les threads sont en **ring 0** et partagent l'espace
  d'adressage du kernel : les vrais processus utilisateur arrivent en v0.3.
- `switch_context(prev, next)` (`arch/x86/switch.asm`) sauve `ebp ebx esi
  edi` sur la pile courante, mémorise `esp` dans `prev`, charge `esp` de
  `next`, restaure les registres et `ret`. Un thread neuf reçoit une pile
  « pré-remplie » avec 4 zéros et l'adresse de `thread_trampoline`, qui
  réactive les interruptions et appelle la fonction du thread.
- **Préemption** : à chaque tick (10 ms) le timer appelle `sched_tick()`.
  Après `SCHED_SLICE_TICKS` (2 ticks = 20 ms) le thread courant passe la
  main au thread READY suivant (round-robin sur une liste circulaire). Le
  changement de contexte se fait dans le handler d'IRQ : le thread
  interrompu reprendra plus tard exactement là, par le `iret` de son stub.
- `thread_sleep_ms()` met le thread en SLEEPING jusqu'à un tick donné ;
  `thread_exit()` le passe en ZOMBIE, il est libéré (pile + structure) par
  le prochain appel à `schedule()` depuis un autre thread.
- Le thread `idle` (`hlt` en boucle) ne tourne que si rien d'autre n'est prêt.
- Commandes : `ps` liste les threads, `spawn N` crée N threads de démo qui
  affichent 3 messages en dormant entre chaque, pendant que le shell reste
  utilisable.

### Console

Tout ce que le kernel affiche part **à la fois** sur la VGA texte (0xB8000)
et sur le port série COM1. Avec `qemu -serial stdio` on récupère donc la
sortie dans le terminal, et le shell accepte aussi les commandes venant de
la série : c'est ce qui rend les tests automatiques possibles.

## 4. Carte mémoire basse au boot

```
0x00000-0x004FF  IVT + BDA (BIOS)
0x07C00-0x07DFF  stage1
0x07E00-0x08DFF  stage2
0x09000-0x09FFF  boot_info (E820)
0x10000-...      kernel (.text .rodata .data .bss, dont le bitmap PMM de 128 Ko)
0x90000          pile temporaire du stage2 (remplacée par celle du kernel)
0xA0000-0xFFFFF  VGA, ROM BIOS
0x100000-...     frames allouables par le PMM (répertoire/tables de pages,
                 pages du tas, piles des threads)
```

Carte **virtuelle** après `paging_init()` :

```
0x00000000-fin RAM   identity map (virtuel = physique)
0xD0000000-0xE0000000 tas kernel (pages mappées à la demande)
```

## 5. Décisions importantes

- **Bootloader maison plutôt que GRUB/Multiboot** : le cahier des charges
  demande un OS réellement indépendant ; écrire le bootloader permet aussi de
  comprendre le passage mode réel → mode protégé.
- **Kernel à 0x10000 (64 Ko) plutôt qu'à 1 Mo** : évite d'avoir à copier le
  kernel après le passage en mode protégé (le BIOS ne peut charger qu'en
  dessous de 1 Mo). Depuis la v0.2 le tas et les piles des threads sont dans
  les frames au-dessus de 1 Mo, donc la seule limite restante est la taille
  du binaire kernel (~500 Ko). Un « higher-half kernel » (kernel remappé en
  haut de l'espace virtuel) sera fait quand les processus utilisateur auront
  besoin de l'espace bas (v0.3).
- **Threads kernel avant processus utilisateur** : le changement de contexte,
  la préemption et le sommeil sont testables sans ring 3 ni appels système.
  Les processus (espace d'adressage privé, ring 3) s'appuieront dessus.
- **32 bits (i386) d'abord** : plus simple que le mode long 64 bits (pas de
  pagination obligatoire). Le passage à x86_64 est envisagé une fois les
  processus et la mémoire virtuelle en place.
- **Sortie série systématique** : permet de tester sans écran, et donc des
  tests automatisés dès la v0.1.
- **Pas de Rust pour l'instant** : C + assembleur, conformément au cahier des
  charges ; Rust pourra arriver quand l'architecture sera stable.
