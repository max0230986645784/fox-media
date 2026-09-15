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

## v0.3 — Processus, disque (fait)

- [x] pilote disque ATA PIO (LBA28, lecture/écriture de secteurs)
- [x] NoxFS : format simple (superbloc, bitmap, table de 256 entrées, fichiers
      contigus), outil hôte `mknoxfs`, lecture dans le kernel, `ls`/`cat`/`cd`
- [x] processus avec espace d'adressage privé (un répertoire de pages par processus)
- [x] mode utilisateur (ring 3), TSS, appels système `int 0x80`
- [x] chargement d'un programme depuis NoxFS (`run`), libnox, programmes de test
- [x] une faute en ring 3 tue le processus seulement ; sa mémoire est rendue
- [ ] higher-half kernel : pas nécessaire pour l'instant (le kernel reste
      identity-mappé en bas, le userland est à 0x40000000-0x80000000)
- [ ] séparation SYSTEM / USER, comptes, permissions → v0.6

## v0.4 — Graphique (Nox Aurora)

- [x] mode vidéo VESA/VBE (framebuffer, 1920×1080 minimum)
- [x] souris PS/2
- [x] gestionnaire de fenêtres Nox Desktop (bureau, barre flottante en bas, recherche)
- [x] banque de sons système (`assets/sounds/`, boot/erreur fournis par l'auteur)
- [ ] menu Nox (clic sur le logo) façon Windows 11 : recherche en haut,
      colonne « Récent », « Recherches rapides » (paramètres), grille d'applications
- [ ] animations de fenêtres : ouverture/fermeture par dissolution en points
      puis léger « swell » (gonflement élastique) — référence vidéo fournie
- [ ] son batterie faible / secteur : uniquement si une batterie est détectée (portables)

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

## Éditions (noms publics)

| Édition | Contenu |
|---|---|
| Nox Genesis | boot, noyau, disque, processus (v0.1–v0.3) |
| Nox Aurora | premier bureau graphique (v0.4) |
| Nox Nova | explorateur, applications, gestionnaire des tâches |
| Nox Guardian | comptes, permissions, écriture disque |
| Nox Beta | réseau, Internet, connexion Discord (QR code) |
| Nox Ultimate | avant-dernière : stabilisation, installation, **clé USB bootable** |
| Nox OS | version finale publique |

Clé USB : `build/noxos.img` est déjà une image disque brute (MBR) ; l'écriture
sur clé (`dd` / Rufus) et l'installateur seront finalisés pour Nox Ultimate.
