/* NoxOS - son systeme : carte AC'97 (bus master PCI) + lecture de fichiers WAV
 *
 * Les sons sont des fichiers WAV PCM 16 bits stereo 48 kHz dans NoxFS
 * (/sys/sounds). La lecture est asynchrone : le fichier est charge en memoire
 * par l'appelant puis un thread "audio" alimente la DMA de la carte.
 */
#ifndef NOX_AUDIO_H
#define NOX_AUDIO_H

#include <nox/types.h>

enum sound_id {
    SND_BOOT,
    SND_ERROR,
    SND_NOTIFY,
    SND_COUNT,
};

bool audio_init(void);                 /* detecte et initialise la carte */
bool audio_available(void);
const char *audio_name(void);          /* description de la carte ("" si aucune) */

/* Charge un WAV depuis NoxFS et le joue (remplace le son en cours).
 * Renvoie false si pas de carte, fichier absent ou format non supporte. */
bool audio_play_file(const char *path);
bool audio_play(enum sound_id id);     /* son systeme nomme (/sys/sounds/...) */
void audio_stop(void);
bool audio_busy(void);
/* Volume 0..100 (PCM out). */
void audio_set_volume(int percent);
int  audio_volume(void);

#endif
