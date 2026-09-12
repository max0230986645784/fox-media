/* NoxOS - tas kernel (kmalloc / kfree)
 *
 * Le tas vit dans la zone virtuelle KHEAP_START..KHEAP_END. Il est compose
 * de blocs contigus, chacun precede d'un en-tete :
 *
 *   [header | payload][header | payload]...  jusqu'a heap_top
 *
 * Les blocs forment une liste doublement chainee ordonnee par adresse.
 * Allocation : premier bloc libre assez grand (first-fit), decoupe si le
 * reste est utile. Liberation : fusion avec les voisins libres. Quand aucun
 * bloc ne convient, on agrandit le tas en mappant de nouvelles frames
 * physiques (PMM) a la fin -> c'est la que la pagination sert vraiment :
 * les adresses virtuelles du tas n'ont rien a voir avec les frames reelles.
 */
#include <nox/memory.h>
#include <nox/paging.h>
#include <nox/pmm.h>
#include <nox/printk.h>
#include <nox/string.h>
#include <nox/io.h>

#define BLOCK_MAGIC    0x4E4F5842u   /* "NOXB" : en-tete de bloc */
#define ALIGNED_MAGIC  0x4E4F5841u   /* "NOXA" : en-tete d'alias aligne */
#define MIN_PAYLOAD    16u
#define ALIGN          16u

struct block {
    u32 magic;
    u32 size;               /* taille du payload en octets */
    u32 free;
    struct block *prev;
    struct block *next;
    u32 pad[3];             /* en-tete = 32 octets -> payload aligne sur 16 */
};

/* Place juste avant un pointeur aligne rendu par kmalloc_aligned. */
struct aligned_hdr {
    u32 magic;
    struct block *block;
};

static struct block *first;
static uintptr_t heap_top;      /* fin de la zone mappee */
static u32 used_bytes;

#define HDR_SIZE      sizeof(struct block)
#define PAYLOAD(b)    ((void *)((u8 *)(b) + HDR_SIZE))
#define BLOCK_END(b)  ((uintptr_t)PAYLOAD(b) + (b)->size)

static void grow(u32 bytes)
{
    uintptr_t new_top = PAGE_ALIGN_UP(heap_top + bytes);
    if (new_top > KHEAP_END)
        panic("heap: virtual space exhausted");
    for (uintptr_t v = heap_top; v < new_top; v += PAGE_SIZE) {
        uintptr_t frame = pmm_alloc_frame();
        if (!frame)
            panic("heap: out of physical memory");
        paging_map(v, frame, PTE_WRITE);
    }
    heap_top = new_top;
}

static struct block *last_block(void)
{
    struct block *b = first;
    while (b && b->next)
        b = b->next;
    return b;
}

/* Ajoute de la place a la fin du tas et renvoie un bloc libre de taille
 * >= size (fusionne avec le dernier bloc s'il est libre). */
static struct block *expand(u32 size)
{
    struct block *last = last_block();
    uintptr_t old_top = heap_top;

    if (last && last->free) {
        grow(size - last->size);
        last->size = (u32)(heap_top - (uintptr_t)PAYLOAD(last));
        return last;
    }

    grow(size + HDR_SIZE);
    struct block *b = (struct block *)old_top;
    memset(b, 0, HDR_SIZE);
    b->magic = BLOCK_MAGIC;
    b->size  = (u32)(heap_top - (uintptr_t)PAYLOAD(b));
    b->free  = 1;
    b->prev  = last;
    b->next  = NULL;
    if (last)
        last->next = b;
    else
        first = b;
    return b;
}

static void split(struct block *b, u32 size)
{
    if (b->size < size + HDR_SIZE + MIN_PAYLOAD)
        return;
    struct block *n = (struct block *)((u8 *)PAYLOAD(b) + size);
    memset(n, 0, HDR_SIZE);
    n->magic = BLOCK_MAGIC;
    n->size  = b->size - size - HDR_SIZE;
    n->free  = 1;
    n->prev  = b;
    n->next  = b->next;
    if (n->next)
        n->next->prev = n;
    b->next = n;
    b->size = size;
}

void heap_init(void)
{
    first = NULL;
    heap_top = KHEAP_START;
    used_bytes = 0;
    expand(PAGE_SIZE - HDR_SIZE);
}

void *kmalloc(size_t size)
{
    if (size == 0)
        size = 1;
    size = (size + ALIGN - 1) & ~(ALIGN - 1);

    u32 flags = irq_save();
    struct block *b = first;
    while (b && !(b->free && b->size >= size))
        b = b->next;
    if (!b)
        b = expand(size);

    split(b, size);
    b->free = 0;
    used_bytes += b->size;
    irq_restore(flags);
    return PAYLOAD(b);
}

void *kmalloc_aligned(size_t size, size_t align)
{
    if (align <= ALIGN)
        return kmalloc(size);

    u8 *raw = kmalloc(size + align + sizeof(struct aligned_hdr));
    uintptr_t p = ((uintptr_t)raw + sizeof(struct aligned_hdr) + align - 1) & ~(align - 1);
    struct aligned_hdr *h = (struct aligned_hdr *)(p - sizeof(struct aligned_hdr));
    h->magic = ALIGNED_MAGIC;
    h->block = (struct block *)(raw - HDR_SIZE);
    return (void *)p;
}

void kfree(void *ptr)
{
    if (!ptr)
        return;

    struct block *b;
    struct aligned_hdr *ah = (struct aligned_hdr *)((u8 *)ptr - sizeof(struct aligned_hdr));
    if (ah->magic == ALIGNED_MAGIC)
        b = ah->block;
    else
        b = (struct block *)((u8 *)ptr - HDR_SIZE);

    if (b->magic != BLOCK_MAGIC)
        panic("kfree: bad pointer %p (corrupted or not from kmalloc)", ptr);
    if (b->free)
        panic("kfree: double free of %p", ptr);

    u32 flags = irq_save();
    b->free = 1;
    used_bytes -= b->size;

    if (b->next && b->next->free) {              /* fusion avec le suivant */
        struct block *n = b->next;
        b->size += HDR_SIZE + n->size;
        b->next = n->next;
        if (b->next)
            b->next->prev = b;
        n->magic = 0;
    }
    if (b->prev && b->prev->free) {              /* fusion avec le precedent */
        struct block *p = b->prev;
        p->size += HDR_SIZE + b->size;
        p->next = b->next;
        if (p->next)
            p->next->prev = p;
        b->magic = 0;
    }
    irq_restore(flags);
}

u32 heap_used_bytes(void)   { return used_bytes; }
u32 heap_mapped_bytes(void) { return (u32)(heap_top - KHEAP_START); }

bool heap_check(void)
{
    u32 flags = irq_save();
    bool ok = true;
    struct block *prev = NULL;
    for (struct block *b = first; b; prev = b, b = b->next) {
        if (b->magic != BLOCK_MAGIC || b->prev != prev ||
            (b->next && (uintptr_t)b->next != BLOCK_END(b)) ||
            (!b->next && BLOCK_END(b) != heap_top)) {
            ok = false;
            break;
        }
    }
    irq_restore(flags);
    return ok;
}
