# Fox Booster

Booster PC gaming pour Windows : ping plus bas, réseau plus stable, téléchargements
plus rapides, FPS boostés, anti-crash et scanner de virus. Tourne en arrière-plan
(icône près de l'horloge) et s'applique tout seul au démarrage du PC.

## Ce que ça fait

- **Réseau / ping** : pile TCP optimisée, algorithme de Nagle coupé, limiteur réseau
  Windows désactivé, DNS rapides (Cloudflare par défaut), cache DNS vidé.
- **Téléchargements** : bande passante réservée par Windows libérée, partage P2P des
  mises à jour coupé.
- **FPS** : plan d'alimentation Performances ultimes, priorité CPU/GPU des jeux au
  maximum, Mode Jeu activé, Game DVR coupé, planification GPU matérielle.
- **Jeux détectés** (Fortnite, Valorant, CS2, GTA/FiveM, Apex, CoD, Rocket League…)
  passés en priorité Haute automatiquement, programmes inutiles fermés pendant le jeu.
- **Anti-crash** : mémoire virtuelle gérée par Windows, délai GPU allongé, optimisations
  plein écran désactivées, réparation des fichiers système (DISM + SFC) sur demande.
- **Scanner de virus** : analyse rapide Windows Defender + détection heuristique dans
  tes dossiers (Téléchargements, Bureau, AppData, démarrage automatique). Rien n'est
  supprimé tout seul : tu coches, tu mets en quarantaine, tu peux restaurer. Les
  fichiers Windows / Microsoft ne sont jamais touchés.
- **Restaurer** : un bouton remet les réglages Windows par défaut.

## Développement

```bash
cd fox-booster
npm install
npm start          # lance l'app (les optimisations n'agissent que sous Windows)
npm run lint
npm run dist:win   # installeur Windows dans release/
```

## Publier l'installeur pour un pote

```bash
git tag booster-v1.0.0
git push --tags
```

GitHub Actions construit `FoxBooster-Setup-1.0.0.exe` et le publie dans les Releases
du dépôt. L'installeur demande les droits administrateur (nécessaires pour les
réglages réseau).
