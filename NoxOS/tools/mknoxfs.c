/* NoxOS - mknoxfs : construit une image NoxFS depuis un repertoire hote
 *
 *   mknoxfs <image> <taille_en_blocs> <repertoire> [label]
 *
 * Outil compile avec le gcc de la machine hote (pas freestanding). Il
 * parcourt le repertoire recursivement et ecrit superbloc + bitmap + table
 * des entrees + donnees, exactement au format decrit dans
 * kernel/include/nox/noxfs.h (le meme header est partage).
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <dirent.h>
#include <sys/stat.h>
#include "../kernel/include/nox/noxfs.h"

static struct noxfs_super super;
static struct noxfs_entry entries[NOXFS_MAX_ENTRIES];
static u8   bitmap[NOXFS_BLOCK_SIZE];
static u32  next_block = NOXFS_DATA_START;
static u32  entry_count;
static FILE *out;

static void die(const char *msg, const char *arg)
{
    fprintf(stderr, "mknoxfs: %s%s%s\n", msg, arg ? ": " : "", arg ? arg : "");
    exit(1);
}

static void mark_used(u32 block)
{
    bitmap[block / 8] |= (u8)(1u << (block % 8));
}

static int new_entry(const char *name, u16 type, u16 parent)
{
    if (entry_count >= NOXFS_MAX_ENTRIES)
        die("trop d'entrees (max 256)", name);
    if (strlen(name) > NOXFS_NAME_MAX)
        die("nom trop long (max 31)", name);
    struct noxfs_entry *e = &entries[entry_count];
    memset(e, 0, sizeof(*e));
    strcpy(e->name, name);
    e->type   = type;
    e->parent = parent;
    return (int)entry_count++;
}

static void add_file(const char *path, const char *name, u16 parent, const struct stat *st)
{
    FILE *f = fopen(path, "rb");
    if (!f)
        die("impossible d'ouvrir", path);

    int idx = new_entry(name, NOXFS_FILE, parent);
    struct noxfs_entry *e = &entries[idx];
    e->size   = (u32)st->st_size;
    e->blocks = (e->size + NOXFS_BLOCK_SIZE - 1) / NOXFS_BLOCK_SIZE;
    e->start  = next_block;
    e->mtime  = (u32)st->st_mtime;
    if (next_block + e->blocks > super.total_blocks)
        die("image trop petite pour", path);

    fseek(out, (long)next_block * NOXFS_BLOCK_SIZE, SEEK_SET);
    u8 buf[NOXFS_BLOCK_SIZE];
    for (u32 b = 0; b < e->blocks; b++) {
        memset(buf, 0, sizeof(buf));
        if (fread(buf, 1, sizeof(buf), f) == 0 && ferror(f))
            die("erreur de lecture", path);
        fwrite(buf, 1, sizeof(buf), out);
        mark_used(next_block++);
    }
    fclose(f);
}

static int cmp_names(const void *a, const void *b)
{
    return strcmp(*(const char *const *)a, *(const char *const *)b);
}

static void add_dir(const char *dirpath, u16 parent)
{
    DIR *d = opendir(dirpath);
    if (!d)
        die("impossible d'ouvrir le repertoire", dirpath);

    /* Tri alphabetique pour une image reproductible. */
    char *names[NOXFS_MAX_ENTRIES];
    int n = 0;
    struct dirent *de;
    while ((de = readdir(d)) != NULL) {
        if (de->d_name[0] == '.')
            continue;
        if (n >= (int)NOXFS_MAX_ENTRIES)
            die("trop de fichiers dans", dirpath);
        names[n++] = strdup(de->d_name);
    }
    closedir(d);
    qsort(names, (size_t)n, sizeof(names[0]), cmp_names);

    for (int i = 0; i < n; i++) {
        char full[4096];
        snprintf(full, sizeof(full), "%s/%s", dirpath, names[i]);
        struct stat st;
        if (stat(full, &st) != 0)
            die("stat", full);
        if (S_ISDIR(st.st_mode)) {
            int idx = new_entry(names[i], NOXFS_DIR, parent);
            entries[idx].mtime = (u32)st.st_mtime;
            add_dir(full, (u16)idx);
        } else if (S_ISREG(st.st_mode)) {
            add_file(full, names[i], parent, &st);
        }
        free(names[i]);
    }
}

int main(int argc, char **argv)
{
    if (argc < 4) {
        fprintf(stderr, "usage: mknoxfs <image> <blocs> <repertoire> [label]\n");
        return 1;
    }
    u32 blocks = (u32)strtoul(argv[2], NULL, 0);
    if (blocks <= NOXFS_DATA_START || blocks > NOXFS_MAX_BLOCKS)
        die("nombre de blocs invalide", argv[2]);

    out = fopen(argv[1], "wb");
    if (!out)
        die("impossible de creer", argv[1]);

    memset(&super, 0, sizeof(super));
    super.magic        = NOXFS_MAGIC;
    super.version      = NOXFS_VERSION;
    super.block_size   = NOXFS_BLOCK_SIZE;
    super.total_blocks = blocks;
    super.max_entries  = NOXFS_MAX_ENTRIES;
    super.data_start   = NOXFS_DATA_START;
    strncpy(super.label, argc > 4 ? argv[4] : "NoxOS", sizeof(super.label) - 1);

    for (u32 b = 0; b < NOXFS_DATA_START; b++)
        mark_used(b);

    int root = new_entry("", NOXFS_DIR, NOXFS_NO_PARENT);
    add_dir(argv[3], (u16)root);

    /* Taille finale de l'image, puis metadonnees. */
    fseek(out, (long)blocks * NOXFS_BLOCK_SIZE - 1, SEEK_SET);
    fputc(0, out);
    fseek(out, 0, SEEK_SET);
    fwrite(&super, 1, sizeof(super), out);
    fwrite(bitmap, 1, sizeof(bitmap), out);
    fwrite(entries, 1, sizeof(entries), out);
    fclose(out);

    printf("==> %s : %u entrees, %u/%u blocs utilises\n",
           argv[1], entry_count, next_block, blocks);
    return 0;
}
