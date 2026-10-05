# NoxOS v0.3 — Architecture et fonctionnement

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
  (`READY / RUNNING / SLEEPING / ZOMBIE`), nom, pile kernel de 16 Ko allouée
  par `kmalloc`, et depuis la v0.3 un pointeur `proc` (NULL pour un thread
  kernel pur) : le thread d'un processus tourne en ring 3 dans l'espace
  d'adressage du processus.
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

### Disque et NoxFS (v0.3)

- `drivers/ata.c` : ATA PIO sur le bus primaire (ports 0x1F0-0x1F7),
  LBA28, commandes IDENTIFY / READ / WRITE SECTORS / CACHE FLUSH, attente
  par scrutation du registre de statut. Pas de DMA ni d'interruption : simple
  et suffisant pour QEMU et un vrai disque IDE/SATA en mode legacy.
- `fs/noxfs.c` + `include/nox/noxfs.h` : NoxFS est un système de fichiers
  conçu pour NoxOS, volontairement simple :
  ```
  bloc 0       superbloc (magic "NOXF", taille de bloc 4096, label)
  bloc 1       bitmap des blocs
  blocs 2..5   table de 256 entrées de 64 octets (nom, taille, bloc de
               départ, type fichier/dossier, parent, mode, owner)
  blocs 6..    données ; chaque fichier est CONTIGU
  ```
  L'arborescence est donnée par le champ `parent` de chaque entrée (entrée 0
  = racine). Le kernel lit (`fs_lookup`, `fs_read`, `fs_load`) ; l'écriture
  kernel arrive en v0.6. L'image est produite sur la machine hôte par
  `tools/mknoxfs` à partir de `rootfs/` + des programmes compilés, et placée
  à 1 Mo dans `noxos.img` (LBA 2048), après le bootloader et le kernel.

### Processus utilisateur, ring 3 et appels système (v0.3)

- **GDT + TSS** (`arch/x86/gdt.c`) : segments code/data ring 3 (sélecteurs
  `0x1B` / `0x23`) et un TSS 32 bits dont on n'utilise que `esp0`/`ss0` : c'est
  la pile que le CPU adopte quand une interruption ou `int 0x80` survient en
  ring 3. L'ordonnanceur y écrit la pile kernel du thread élu à chaque
  changement de contexte (`tss_set_kernel_stack`).
- **Espace d'adressage** (`mm/paging.c`) : un répertoire de pages par
  processus (`paging_create_directory`). Les 1024 entrées couvrant le kernel
  (identity map bas + tas `0xD0000000`) sont copiées depuis le répertoire
  kernel : les mêmes tables sont partagées, donc tout ce que le kernel mappe
  est visible dans tous les processus (les tables du tas sont pré-allouées à
  l'init pour que cette copie reste valable). La zone `0x40000000-0x80000000`
  est privée : image du programme à `USER_BASE`, pile de 64 Ko sous
  `USER_STACK_TOP`, pages marquées `PTE_USER`. `schedule()` charge le CR3 du
  processus élu (`paging_switch`).
- **Chargement** (`proc/process.c`) : `process_spawn(path)` lit le binaire
  plat depuis NoxFS, alloue et copie les pages, crée un thread kernel dont la
  fonction se contente d'appeler `enter_user_mode(eip, esp)`
  (`arch/x86/user_enter.asm`) : on empile `ss esp eflags(IF=1) cs eip` avec
  des sélecteurs ring 3 et `iret` fait la transition. Le programme est
  ensuite préempté par le timer comme n'importe quel thread.
- **Appels système** (`proc/syscall.c`, `include/nox/syscall.h`) : porte IDT
  `0x80` avec DPL 3 (`0xEE`) ; `eax` = numéro, `ebx ecx edx` = arguments,
  résultat dans `eax`. Le stub `isr128` réutilise `isr_common` ; la structure
  `registers` a gagné `useresp`/`ss` que le CPU pousse en venant du ring 3.
  Tout pointeur utilisateur est vérifié par `user_range_ok()` (dans
  `[USER_BASE, USER_STACK_TOP)` ET mappé dans le répertoire du processus)
  avant d'être touché : un programme ne peut pas faire lire/écrire le kernel
  à sa place. Appels v0.3 : `exit write read getpid yield sleep uptime`.
- **Isolation** : une exception dont `cs` a RPL 3 (page fault, GPF sur `cli`
  ou `in`, opcode invalide...) est routée vers `process_fault()` qui affiche
  un diagnostic et appelle `process_exit(-1)`. Celui-ci repasse sur le
  répertoire kernel, libère toutes les pages/tables/répertoire du processus
  (`paging_destroy_directory`) et termine le thread. Le shell récupère le code
  de sortie (`process_wait`, ou `process_collect` avant chaque prompt pour les
  processus lancés avec `&`). Le test `frames` avant/après vérifie qu'aucune
  frame ne fuit.
- **Userland** (`user/`) : `crt0.asm` (`_start` → `main` → `exit`),
  `libnox` (`nox.c` : enveloppes `int 0x80`, `puts`, `putu`, `readline`),
  programmes dans `user/bin/*.c` liés à `0x40000000` par `user.ld` ; le
  `.bss` est inclus dans le binaire plat (zéros) pour que taille du fichier =
  mémoire à mapper. Ce sont les premières briques de ce qui deviendra le SDK.

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
0x00000000-fin RAM    identity map (virtuel = physique), kernel seulement (pas PTE_USER)
0x40000000-...        image du processus courant (privée, ring 3)
...-0x80000000        pile du processus courant (64 Ko, privée, ring 3)
0xD0000000-0xE0000000 tas kernel (pages mappées à la demande, tables partagées)
```

## 5. Décisions importantes

- **Bootloader maison plutôt que GRUB/Multiboot** : le cahier des charges
  demande un OS réellement indépendant ; écrire le bootloader permet aussi de
  comprendre le passage mode réel → mode protégé.
- **Kernel à 0x10000 (64 Ko) plutôt qu'à 1 Mo** : évite d'avoir à copier le
  kernel après le passage en mode protégé (le BIOS ne peut charger qu'en
  dessous de 1 Mo). Depuis la v0.2 le tas et les piles des threads sont dans
  les frames au-dessus de 1 Mo, donc la seule limite restante est la taille
  du binaire kernel (~500 Ko). Le userland est placé à `0x40000000`, donc le
  kernel identity-mappé en bas ne le gêne pas : le « higher-half kernel » n'est
  pas nécessaire pour le moment.
- **Binaires plats plutôt qu'ELF pour les programmes (v0.3)** : le loader
  tient en 30 lignes et se teste facilement. Un loader ELF viendra avec le
  SDK quand les programmes auront besoin de plusieurs segments/permissions.
- **Un thread par processus** : suffisant jusqu'au desktop ; les threads
  utilisateur multiples seront ajoutés quand une application en aura besoin.
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
