/* NoxOS - pilote NoxFS (lecture)
 *
 * Au montage on lit le superbloc et la table des entrees (16 Ko) en RAM.
 * Ensuite toute recherche de chemin se fait en memoire ; seul le contenu des
 * fichiers est lu sur le disque, bloc par bloc, via un buffer de rebond de
 * 4 Ko (les lectures ne sont pas forcement alignees sur un secteur).
 */
#include <nox/fs.h>
#include <nox/ata.h>
#include <nox/memory.h>
#include <nox/printk.h>
#include <nox/string.h>

#define SECTORS_PER_BLOCK (NOXFS_BLOCK_SIZE / ATA_SECTOR_SIZE)

static struct noxfs_super super;
static struct noxfs_entry *entries;
static u8   bounce[NOXFS_BLOCK_SIZE];
static bool mounted;

static bool read_block(u32 block, void *buf)
{
    return ata_read(NOXFS_DISK_LBA + block * SECTORS_PER_BLOCK, SECTORS_PER_BLOCK, buf);
}

bool fs_init(void)
{
    mounted = false;
    if (!read_block(0, &super))
        return false;
    if (super.magic != NOXFS_MAGIC || super.block_size != NOXFS_BLOCK_SIZE ||
        super.max_entries != NOXFS_MAX_ENTRIES)
        return false;

    entries = kmalloc(NOXFS_MAX_ENTRIES * sizeof(struct noxfs_entry));
    if (!entries)
        return false;
    for (u32 b = 0; b < NOXFS_ENTRY_BLOCKS; b++)
        if (!read_block(2 + b, (u8 *)entries + b * NOXFS_BLOCK_SIZE))
            return false;
    if (entries[0].type != NOXFS_DIR)
        return false;
    mounted = true;
    return true;
}

bool fs_mounted(void) { return mounted; }
const struct noxfs_super *fs_super(void) { return &super; }

const struct noxfs_entry *fs_entry(int idx)
{
    if (!mounted || idx < 0 || idx >= (int)NOXFS_MAX_ENTRIES)
        return NULL;
    if (entries[idx].type == NOXFS_FREE)
        return NULL;
    return &entries[idx];
}

int fs_next_child(int dir, int after)
{
    if (!mounted)
        return -1;
    for (int i = after + 1; i < (int)NOXFS_MAX_ENTRIES; i++)
        if (entries[i].type != NOXFS_FREE && entries[i].parent == dir)
            return i;
    return -1;
}

static int find_child(int dir, const char *name, size_t len)
{
    if (len == 0 || (len == 1 && name[0] == '.'))
        return dir;
    if (len == 2 && name[0] == '.' && name[1] == '.')
        return entries[dir].parent == NOXFS_NO_PARENT ? dir : entries[dir].parent;
    for (int i = fs_next_child(dir, -1); i >= 0; i = fs_next_child(dir, i))
        if (strlen(entries[i].name) == len && memcmp(entries[i].name, name, len) == 0)
            return i;
    return -1;
}

int fs_lookup(const char *path, int cwd)
{
    if (!mounted || !path)
        return -1;
    int cur = cwd;
    if (*path == '/') {
        cur = 0;
        path++;
    }
    if (cur < 0 || cur >= (int)NOXFS_MAX_ENTRIES || entries[cur].type != NOXFS_DIR)
        return -1;

    while (*path) {
        const char *seg = path;
        while (*path && *path != '/')
            path++;
        size_t len = (size_t)(path - seg);
        while (*path == '/')
            path++;
        if (entries[cur].type != NOXFS_DIR)
            return -1;
        cur = find_child(cur, seg, len);
        if (cur < 0)
            return -1;
    }
    return cur;
}

void fs_path_of(int idx, char *out, size_t cap)
{
    if (cap == 0)
        return;
    if (!mounted || idx <= 0 || idx >= (int)NOXFS_MAX_ENTRIES) {
        strcpy(out, "/");
        return;
    }
    /* On remonte jusqu'a la racine en empilant les noms. */
    int chain[32];
    int n = 0;
    for (int i = idx; i > 0 && n < 32; i = entries[i].parent)
        chain[n++] = i;
    size_t pos = 0;
    for (int k = n - 1; k >= 0; k--) {
        const char *name = entries[chain[k]].name;
        size_t l = strlen(name);
        if (pos + 1 + l + 1 > cap)
            break;
        out[pos++] = '/';
        memcpy(out + pos, name, l);
        pos += l;
    }
    if (pos == 0)
        out[pos++] = '/';
    out[pos] = '\0';
}

int fs_read(int idx, u32 off, void *buf, u32 len)
{
    const struct noxfs_entry *e = fs_entry(idx);
    if (!e || e->type != NOXFS_FILE)
        return -1;
    if (off >= e->size)
        return 0;
    if (len > e->size - off)
        len = e->size - off;

    u8 *dst = buf;
    u32 done = 0;
    while (done < len) {
        u32 block  = (off + done) / NOXFS_BLOCK_SIZE;
        u32 inner  = (off + done) % NOXFS_BLOCK_SIZE;
        u32 chunk  = NOXFS_BLOCK_SIZE - inner;
        if (chunk > len - done)
            chunk = len - done;
        if (!read_block(e->start + block, bounce))
            return -1;
        memcpy(dst + done, bounce + inner, chunk);
        done += chunk;
    }
    return (int)done;
}

void *fs_load(int idx, u32 *size_out)
{
    const struct noxfs_entry *e = fs_entry(idx);
    if (!e || e->type != NOXFS_FILE)
        return NULL;
    u8 *data = kmalloc(e->size + 1);
    if (!data)
        return NULL;
    if (fs_read(idx, 0, data, e->size) != (int)e->size) {
        kfree(data);
        return NULL;
    }
    data[e->size] = '\0';
    if (size_out)
        *size_out = e->size;
    return data;
}

u32 fs_used_blocks(void)
{
    u32 used = NOXFS_DATA_START;
    for (u32 i = 0; i < NOXFS_MAX_ENTRIES; i++)
        if (entries[i].type == NOXFS_FILE)
            used += entries[i].blocks;
    return used;
}
