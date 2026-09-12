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

## v0.2 — Mémoire et multitâche (fait)

- [x] allocateur de frames physiques (bitmap 4 Ko sur la carte E820)
- [x] pagination 2 niveaux, identity map, page fault handler
- [x] tas kernel virtuel `kmalloc`/`kmalloc_aligned`/`kfree` avec fusion des blocs
- [x] threads kernel, changement de contexte, ordonnanceur préemptif round-robin (timer)
- [x] `sleep`, `exit`, thread idle, commandes `ps` / `spawn` / `heaptest`
- [x] tests QEMU étendus (`make test`)

## v0.3 — Processus, disque et sécurité de base

- [ ] kernel remappé en haut de l'espace virtuel (higher half)
- [ ] processus avec espace d'adressage privé (un répertoire de pages par processus)
- [ ] mode utilisateur (ring 3), TSS, appels système
- [ ] pilote disque ATA (PIO) et premier système de fichiers NoxFS (lecture seule d'abord)
- [ ] séparation SYSTEM / USER dans le système de fichiers
- [ ] comptes, permissions, privilèges administrateur

## v0.4 — Graphique

- [ ] mode vidéo VESA/VBE (framebuffer)
- [ ] souris PS/2
- [ ] gestionnaire de fenêtres Nox Desktop (bureau, barre des tâches, menu Nox)

Direction visuelle décidée : un mélange **Windows / macOS**. La maquette
fournie par le propriétaire du projet sert de modèle pour la barre des tâches
(dock centré), le gestionnaire des tâches et les paramètres de la barre. Le
logo officiel est `assets/logo.png`.

## Principe transverse — vie privée

NoxOS ne doit pas rendre la machine identifiable :

- aucune télémétrie, aucun identifiant machine envoyé vers l'extérieur ;
- pas d'exposition inutile du matériel (numéros de série, MAC réelle, CPUID
  complet) aux applications ni au réseau : adresses MAC aléatoires par
  connexion, identifiants réseau (IPv6 temporaires, hostname générique) non
  liés à la machine ;
- les applications Nox Studio n'accèdent au matériel que via des API
  d'abstraction, jamais directement.

Ces règles se concrétiseront dans la pile réseau et la couche sécurité
(v0.3+), pas dans le kernel texte actuel.

## v0.5 → v1.0

Voir le cahier des charges : explorateur, terminal complet, réseau,
gestionnaire de paquets, Nox Studio, SDK, installation, stabilisation.
