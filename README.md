# Fox Media

Lecteur local de musique et de vidéo (Windows, Android, PWA iPhone/iPad).
Les fichiers restent sur l'appareil de l'utilisateur, rien n'est envoyé en ligne.

## Développement

```bash
npm install
npm run dev          # interface dans le navigateur
npm run electron:dev # application PC
npm run build && npm run lint
```

## Paquets

```bash
npm run dist:win     # installeur Windows (.exe, ffmpeg inclus)
npm run dist:linux   # AppImage + deb
npm run android:apk  # APK Android signé
```

## Bot de clés par email

Le serveur `server/licence-server.mjs` génère les clés signées et les envoie
automatiquement par email. Variables d'environnement (jamais dans le code) :

| Variable | Rôle |
| --- | --- |
| `LICENCE_PRIVATE_KEY` | clé privée ECDSA, générée par `npm run licence:keys` |
| `TOKEN_SECRET` | secret de signature des sessions |
| `BREVO_API_KEY` | clé API Brevo (envoi des emails) |
| `FROM_EMAIL` | expéditeur, ex. `Fox Media <foxmedia.pub@hotmail.com>` |
| `RESEND_API_KEY` | alternative à Brevo |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | vente des clés (optionnel) |
| `ADMIN_TOKEN` | révocation d'une clé partagée |

Brevo demande de valider une fois l'adresse expéditrice (clic sur le lien reçu
dans la boîte Hotmail) ; ensuite les mails partent au nom de cette adresse.

Côté application : `VITE_LICENCE_SERVER`, `VITE_LICENCE_PUBLIC_KEY`,
`VITE_OWNER_CODE` (accès au porte-monnaie), `VITE_ADS_PAYMENT_URL`,
`VITE_ADSENSE_CLIENT` ou `VITE_ADS_SCRIPT`.
