# Sons systeme NoxOS

Sons fournis par l'auteur (ne pas regenerer) :

| Fichier | Evenement |
|---|---|
| `boot.mp3` | demarrage de NoxOS |
| `error.mp3` | erreur (boite de dialogue, action refusee) |

Autres sons : banques libres de droits, telecharges et normalises (-16 LUFS)
par `python3 tools/fetchsounds.py assets/sounds` (la source exacte de chaque
son est listee dans ce script) :

- Mixkit - licence Mixkit (usage libre, y compris commercial) : https://mixkit.co/license/
- Kenney "Interface Sounds" - CC0 : https://kenney.nl/assets/interface-sounds

| Fichier | Evenement |
|---|---|
| `shutdown.mp3` | arret / redemarrage |
| `login.mp3` | ouverture de session |
| `logout.mp3` | fermeture de session |
| `lock.mp3` / `unlock.mp3` | verrouillage / deverrouillage |
| `notification.mp3` | notification generale |
| `message.mp3` | nouveau message (Nox Connect, Noxia) |
| `warning.mp3` | avertissement |
| `critical.mp3` | arret critique (panique noyau, disque) |
| `recycle.mp3` | vider la corbeille |
| `device-connect.mp3` / `device-disconnect.mp3` | peripherique branche / debranche |
| `screenshot.mp3` | capture d'ecran |
| `minimize.mp3` / `maximize.mp3` | fenetre reduite / agrandie |
| `download-done.mp3` | telechargement ou installation terminee |
| `click.mp3` | clic d'interface (optionnel, desactive par defaut) |
| `volume.mp3` | reglage du volume |
| `battery-low.mp3` | batterie faible - **PC portables uniquement** (batterie detectee) |
| `charging.mp3` | secteur branche - **PC portables uniquement** |

Lecture : aucun pilote audio n'existe encore dans NoxOS ; ces sons seront joues
quand le pilote son (AC'97 / HD Audio) et un decodeur seront implementes.
