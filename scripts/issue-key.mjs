/**
 * Issues one licence key by hand, without the server.
 *
 *   LICENCE_PRIVATE_KEY=... node scripts/issue-key.mjs paid ami@mail.com
 *
 * plan: paid | founder | referral
 */

import { createSign, randomUUID } from 'node:crypto';

const [plan = 'paid', email = ''] = process.argv.slice(2);
const secret = process.env.LICENCE_PRIVATE_KEY;

if (!secret) {
  console.error('LICENCE_PRIVATE_KEY manquant (node scripts/licence-keys.mjs)');
  process.exit(1);
}
if (!['paid', 'founder', 'referral'].includes(plan)) {
  console.error(`plan inconnu: ${plan}`);
  process.exit(1);
}

const payload = { id: randomUUID(), plan, email, issuedAt: Date.now() };
const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
const signer = createSign('SHA256');
signer.update(bytes);
const signature = signer.sign({
  key: Buffer.from(secret, 'base64'),
  format: 'der',
  type: 'pkcs8',
  dsaEncoding: 'ieee-p1363',
});

console.log(`FOX-${bytes.toString('base64url')}-${signature.toString('base64url')}`);
