/* NoxOS - acces au systeme de fichiers NoxFS depuis le kernel */
#ifndef NOX_FS_H
#define NOX_FS_H

#include <nox/types.h>
#include <nox/noxfs.h>

bool fs_init(void);                              /* monte NoxFS, false si absent */
bool fs_mounted(void);
const struct noxfs_super *fs_super(void);

/* Resolution d'un chemin absolu ("/bin/hello"). Renvoie l'index de l'entree
 * ou -1. Les chemins relatifs sont resolus depuis `cwd` (index d'un repertoire). */
int  fs_lookup(const char *path, int cwd);
const struct noxfs_entry *fs_entry(int idx);
void fs_path_of(int idx, char *out, size_t cap);   /* reconstruit "/a/b" */

/* Enumeration d'un repertoire : renvoie l'index de l'enfant suivant apres
 * `after` (utiliser -1 pour commencer), ou -1 a la fin. */
int  fs_next_child(int dir, int after);

/* Lecture de `len` octets a l'offset `off` d'un fichier. Renvoie le nombre
 * d'octets lus (tronque a la fin du fichier) ou -1 en cas d'erreur disque. */
int  fs_read(int idx, u32 off, void *buf, u32 len);

/* Charge un fichier entier dans un buffer kmalloc (+1 octet nul final). */
void *fs_load(int idx, u32 *size_out);

u32  fs_used_blocks(void);

#endif
