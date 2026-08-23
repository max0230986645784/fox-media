/**
 * Generates the ECDSA P-256 pair used to sign licence keys.
 *
 *   node scripts/licence-keys.mjs
 *
 * Put LICENCE_PRIVATE_KEY in the licence server environment only, and
 * VITE_LICENCE_PUBLIC_KEY in the app .env (the app only ever verifies).
 */

import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const priv = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

console.log('# Fox Media licence keys — garde la clé privée secrète\n');
console.log(`VITE_LICENCE_PUBLIC_KEY=${pub}\n`);
console.log(`LICENCE_PRIVATE_KEY=${priv}`);
