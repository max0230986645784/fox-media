// Builds the folder published on Vercel: the landing page at the root and the
// installable web app (PWA) under /app.
import { cp, mkdir, rm } from 'node:fs/promises';

const OUT = 'public-site';

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp('site', OUT, { recursive: true });
await cp('dist', `${OUT}/app`, { recursive: true });

console.log(`Site pret dans ${OUT}/ (page d'accueil) et ${OUT}/app/ (application).`);
