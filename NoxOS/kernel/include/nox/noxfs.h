/* NoxOS - format disque NoxFS (partage entre le kernel et tools/mknoxfs.c)
 *
 * Systeme de fichiers volontairement simple, concu pour NoxOS :
 *
 *   bloc 0            : superbloc
 *   bloc 1            : bitmap des blocs (1 bit par bloc, 1 = occupe)
 *   blocs 2..5        : table des entrees (256 entrees de 64 octets)
 *   blocs 6..         : donnees des fichiers (chaque fichier est contigu)
 *
 * L'arborescence est representee par le champ `parent` de chaque entree :
 * l'entree 0 est le repertoire racine "/". Il n'y a pas d'inode, pas de
 * fragmentation : un fichier occupe `blocks` blocs consecutifs a partir
 * de `start`. Cela suffit pour un systeme de fichiers systeme en lecture
 * (programmes, configuration) et reste trivial a verifier.
 */
#ifndef NOX_NOXFS_H
#define NOX_NOXFS_H

#ifdef __KERNEL__
#include <nox/types.h>
#else
#include <stdint.h>
typedef uint8_t  u8;
typedef uint16_t u16;
typedef uint32_t u32;
#endif

#define NOXFS_MAGIC        0x46584F4Eu   /* "NOXF" */
#define NOXFS_VERSION      1
#define NOXFS_BLOCK_SIZE   4096u
#define NOXFS_MAX_ENTRIES  256u
#define NOXFS_NAME_MAX     31
#define NOXFS_ENTRY_BLOCKS ((NOXFS_MAX_ENTRIES * 64u) / NOXFS_BLOCK_SIZE)  /* 4 */
#define NOXFS_DATA_START   (2u + NOXFS_ENTRY_BLOCKS)                     /* 6 */
#define NOXFS_MAX_BLOCKS   (NOXFS_BLOCK_SIZE * 8u)                       /* 32768 = 128 Mo */
#define NOXFS_NO_PARENT    0xFFFFu

/* Secteur LBA ou commence NoxFS sur le disque de boot (1 Mo apres le debut). */
#define NOXFS_DISK_LBA     2048u

enum noxfs_type {
    NOXFS_FREE = 0,
    NOXFS_FILE = 1,
    NOXFS_DIR  = 2,
};

struct noxfs_super {
    u32 magic;
    u32 version;
    u32 block_size;
    u32 total_blocks;     /* taille du volume en blocs */
    u32 max_entries;
    u32 data_start;       /* premier bloc de donnees */
    char label[32];
    u8  reserved[NOXFS_BLOCK_SIZE - 56];
} __attribute__((packed));

struct noxfs_entry {
    char name[NOXFS_NAME_MAX + 1];
    u32  size;            /* octets (0 pour un repertoire) */
    u32  start;           /* premier bloc de donnees */
    u32  blocks;          /* nombre de blocs alloues */
    u16  type;            /* enum noxfs_type */
    u16  parent;          /* index de l'entree parente, NOXFS_NO_PARENT pour "/" */
    u32  mtime;           /* secondes Unix, informatif */
    u16  mode;            /* bits de permission (v0.6), 0 = defaut */
    u16  owner;           /* id utilisateur (v0.6) */
    u8   pad[8];
} __attribute__((packed));

#endif
