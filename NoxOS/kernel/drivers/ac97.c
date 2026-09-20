/* NoxOS - pilote audio AC'97 (Intel 82801AA et compatibles, emule par QEMU)
 *
 * Deux plages d'E/S PCI : NAM (mixer, BAR0) et NABM (bus master, BAR1).
 * Le canal "PCM out" lit une liste de 32 descripteurs (BDL) ; chaque
 * descripteur pointe un buffer physique et sa taille en echantillons.
 * On n'utilise pas d'IRQ : le thread audio surveille l'index du descripteur
 * courant (CIV) et remplit les buffers liberes a partir du WAV en memoire.
 * Les buffers DMA sont statiques (.bss, memoire basse identity-mappee).
 */
#include <nox/audio.h>
#include <nox/pci.h>
#include <nox/io.h>
#include <nox/fs.h>
#include <nox/memory.h>
#include <nox/thread.h>
#include <nox/printk.h>
#include <nox/string.h>

/* registres mixer (NAM) */
#define NAM_RESET        0x00
#define NAM_MASTER_VOL   0x02
#define NAM_PCM_OUT_VOL  0x18
#define NAM_EXT_CTRL     0x2A
#define NAM_PCM_RATE     0x2C
/* registres bus master (NABM) */
#define NABM_PO_BDBAR    0x10   /* adresse physique de la BDL (u32) */
#define NABM_PO_CIV      0x14   /* descripteur courant (u8) */
#define NABM_PO_LVI      0x15   /* dernier descripteur valide (u8) */
#define NABM_PO_SR       0x16   /* statut (u16) */
#define NABM_PO_CR       0x1B   /* controle (u8) */
#define NABM_GLOB_CNT    0x2C
#define NABM_GLOB_STA    0x30

#define CR_RPBM  0x01           /* run */
#define CR_RR    0x02           /* reset des registres du canal */
#define SR_DCH   0x01           /* DMA arretee */

#define BDL_ENTRIES 32
#define DMA_BUFS    4
#define DMA_BUF_SZ  32768       /* octets ; 170 ms a 48 kHz stereo 16 bits */
#define SAMPLE_RATE 48000

struct bdl_entry { u32 addr; u16 samples; u16 flags; } __attribute__((packed));

static struct bdl_entry bdl[BDL_ENTRIES] __attribute__((aligned(8)));
static u8  dma_buf[DMA_BUFS][DMA_BUF_SZ] __attribute__((aligned(4096)));

static bool present;
static u16  nam, nabm;
static char card_name[40];
static int  volume = 80;

/* requete de lecture (partagee avec le thread audio, protegee par cli/sti) */
static u8  *req_pcm;            /* donnees PCM (kmalloc) ; NULL = rien */
static u32  req_len;
static u32  generation;
static bool playing;

static inline void outl(u16 port, u32 v) { __asm__ volatile("outl %0, %1" : : "a"(v), "Nd"(port)); }
static inline u32  inl(u16 port) { u32 v; __asm__ volatile("inl %1, %0" : "=a"(v) : "Nd"(port)); return v; }

static void set_volume_regs(void)
{
    /* 0 = max, 31 = -46.5 dB, attenuation lineaire */
    u8 att = (u8)((100 - volume) * 31 / 100);
    outw(nam + NAM_MASTER_VOL, 0x0000);
    outw(nam + NAM_PCM_OUT_VOL, (u16)((att << 8) | att));
}

static void channel_reset(void)
{
    outb(nabm + NABM_PO_CR, 0);
    outb(nabm + NABM_PO_CR, CR_RR);
    for (int i = 0; i < 1000 && (inb(nabm + NABM_PO_CR) & CR_RR); i++)
        io_wait();
    outw(nabm + NABM_PO_SR, 0x1C);          /* efface les bits d'evenement */
    outl(nabm + NABM_PO_BDBAR, (u32)(uintptr_t)bdl);   /* le reset efface BDBAR */
}

static void audio_thread(void *arg);

bool audio_init(void)
{
    struct pci_dev d;
    if (!pci_find_class(0x04, 0x01, &d))
        return false;
    if (!(d.bar[0] & 1) || !(d.bar[1] & 1))          /* les deux doivent etre des ports */
        return false;
    pci_enable(&d);
    nam  = (u16)(d.bar[0] & ~3u);
    nabm = (u16)(d.bar[1] & ~3u);

    /* reset froid puis attente du codec primaire */
    outl(nabm + NABM_GLOB_CNT, 0x02);
    bool ready = false;
    for (int i = 0; i < 100000 && !ready; i++)
        ready = (inl(nabm + NABM_GLOB_STA) & 0x100) != 0;
    if (!ready)
        return false;
    outw(nam + NAM_RESET, 0);
    /* frequence variable : on la force a 48 kHz si supportee (sinon 48 kHz fixe) */
    outw(nam + NAM_EXT_CTRL, inw(nam + NAM_EXT_CTRL) | 1);
    outw(nam + NAM_PCM_RATE, SAMPLE_RATE);
    set_volume_regs();
    channel_reset();

    strcpy(card_name, "AC'97 pci ");
    utoa(d.vendor, card_name + 10, 16);
    size_t n = strlen(card_name);
    card_name[n] = ':';
    utoa(d.device, card_name + n + 1, 16);
    present = true;
    thread_create("audio", audio_thread, NULL);
    return true;
}

bool audio_available(void) { return present; }
const char *audio_name(void) { return present ? card_name : ""; }
bool audio_busy(void) { return playing; }
int  audio_volume(void) { return volume; }

void audio_set_volume(int percent)
{
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;
    volume = percent;
    if (present) set_volume_regs();
}

/* --------------------------------------------------------------------------
 * Thread audio : attend une requete puis alimente la DMA jusqu'a la fin.
 * ------------------------------------------------------------------------ */
static void play_pcm(const u8 *pcm, u32 len, u32 gen)
{
    channel_reset();
    u32 pos = 0, filled = 0, done = 0;
    u8 last_civ = 0;

    while (done < filled || pos < len) {
        if (generation != gen) break;                  /* nouvelle requete / stop */
        /* remplir les buffers libres */
        while (pos < len && filled - done < DMA_BUFS) {
            u32 n = len - pos; if (n > DMA_BUF_SZ) n = DMA_BUF_SZ;
            n &= ~3u;
            if (!n) { pos = len; break; }
            u8 *buf = dma_buf[filled % DMA_BUFS];
            memcpy(buf, pcm + pos, n);
            struct bdl_entry *e = &bdl[filled % BDL_ENTRIES];
            e->addr = (u32)(uintptr_t)buf;
            e->samples = (u16)(n / 2);
            e->flags = 0;
            outb(nabm + NABM_PO_LVI, (u8)(filled % BDL_ENTRIES));
            pos += n; filled++;
            if (filled == 1) { last_civ = 0; outb(nabm + NABM_PO_CR, CR_RPBM); }
        }
        if (pos < len && (inw(nabm + NABM_PO_SR) & SR_DCH))
            outb(nabm + NABM_PO_CR, CR_RPBM);       /* sous-alimentation : on relance */
        thread_sleep_ms(10);
        u8 civ = inb(nabm + NABM_PO_CIV);
        if (civ != last_civ) { done += (u8)(civ - last_civ) & (BDL_ENTRIES - 1); last_civ = civ; }
        if (pos >= len && (inw(nabm + NABM_PO_SR) & SR_DCH)) break;
    }
    outb(nabm + NABM_PO_CR, 0);
}

static void audio_thread(void *arg)
{
    (void)arg;
    for (;;) {
        u32 f = irq_save();
        u8 *pcm = req_pcm; u32 len = req_len, gen = generation;
        req_pcm = NULL;
        irq_restore(f);
        if (!pcm) { thread_sleep_ms(20); continue; }
        playing = true;
        play_pcm(pcm, len, gen);
        kfree(pcm);
        playing = false;
    }
}

/* --------------------------------------------------------------------------
 * WAV : RIFF/WAVE, fmt PCM 16 bits 2 canaux 48 kHz, chunk "data"
 * ------------------------------------------------------------------------ */
static u32 rd32(const u8 *p) { return p[0] | (p[1] << 8) | (p[2] << 16) | ((u32)p[3] << 24); }
static u16 rd16(const u8 *p) { return (u16)(p[0] | (p[1] << 8)); }

static bool wav_parse(const u8 *f, u32 size, u32 *data_off, u32 *data_len)
{
    if (size < 12 || memcmp(f, "RIFF", 4) || memcmp(f + 8, "WAVE", 4))
        return false;
    bool fmt_ok = false;
    u32 off = 12;
    while (off + 8 <= size) {
        u32 clen = rd32(f + off + 4);
        const u8 *c = f + off + 8;
        if (!memcmp(f + off, "fmt ", 4) && clen >= 16) {
            fmt_ok = rd16(c) == 1 && rd16(c + 2) == 2 && rd32(c + 4) == SAMPLE_RATE && rd16(c + 14) == 16;
        } else if (!memcmp(f + off, "data", 4)) {
            if (!fmt_ok) return false;
            if (off + 8 + clen > size) clen = size - off - 8;
            *data_off = off + 8; *data_len = clen;
            return true;
        }
        off += 8 + clen + (clen & 1);
    }
    return false;
}

bool audio_play_file(const char *path)
{
    if (!present || !fs_mounted())
        return false;
    int idx = fs_lookup(path, 0);
    if (idx < 0)
        return false;
    u32 size;
    u8 *file = fs_load(idx, &size);
    if (!file)
        return false;
    u32 doff, dlen;
    if (!wav_parse(file, size, &doff, &dlen) || !dlen) {
        kfree(file);
        return false;
    }
    /* on garde le buffer entier : le PCM est a l'interieur */
    u8 *pcm = kmalloc(dlen);
    if (!pcm) { kfree(file); return false; }
    memcpy(pcm, file + doff, dlen);
    kfree(file);

    u32 f = irq_save();
    u8 *old = req_pcm;
    req_pcm = pcm; req_len = dlen; generation++;
    irq_restore(f);
    kprintf("audio: %s (%u ms)\n", path, dlen / (SAMPLE_RATE * 4 / 1000));
    if (old) kfree(old);
    return true;
}

static const char *const sound_paths[SND_COUNT] = {
    [SND_BOOT]   = "/sys/sounds/boot.wav",
    [SND_ERROR]  = "/sys/sounds/error.wav",
    [SND_NOTIFY] = "/sys/sounds/notification.wav",
};

bool audio_play(enum sound_id id)
{
    if (id >= SND_COUNT) return false;
    return audio_play_file(sound_paths[id]);
}

void audio_stop(void)
{
    u32 f = irq_save();
    u8 *old = req_pcm; req_pcm = NULL; generation++;
    irq_restore(f);
    if (old) kfree(old);
}
