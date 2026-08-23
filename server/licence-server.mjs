/**
 * Fox Media licence server.
 *
 * Issues signed licence keys:
 *  - the first FREE_INSTALLS installs get a free "founder" key;
 *  - every referred friend gets a free "referral" key (max REFERRAL_LIMIT per
 *    account, and those never consume the founder quota);
 *  - everyone else buys a key for PRICE_EUR through Stripe.
 *
 * Run it on any Node 20+ host. Secrets come from the environment, never from
 * the client bundle:
 *   LICENCE_PRIVATE_KEY   PKCS#8 base64, from `npm run licence:keys`
 *   TOKEN_SECRET          random string used to sign session tokens
 *   STRIPE_SECRET_KEY     Stripe secret key (optional, needed to sell keys)
 *   STRIPE_WEBHOOK_SECRET Stripe webhook signing secret
 *   BREVO_API_KEY         Brevo key, sends the licence from your own address
 *   RESEND_API_KEY        Resend key (alternative to Brevo)
 *   FROM_EMAIL            sender, e.g. "Fox Media <foxmedia.pub@hotmail.com>"
 *   PUBLIC_URL            public URL of this server, used in Stripe redirects
 *   ADMIN_TOKEN           bearer token allowed to revoke a leaked licence
 */

import { createServer } from 'node:http';
import { createHmac, createSign, randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'server', 'data');
const DB_FILE = path.join(DATA_DIR, 'licences.json');

const PRICE_CENTS = Number(process.env.PRICE_CENTS ?? 100);
const FREE_INSTALLS = Number(process.env.FREE_INSTALLS ?? 100);
const REFERRAL_LIMIT = Number(process.env.REFERRAL_LIMIT ?? 5);
/** Referral programme end date, ISO string. Defaults to one month from first boot. */
const REFERRAL_ENDS_AT = process.env.REFERRAL_ENDS_AT ?? '';

const PRIVATE_KEY_B64 = process.env.LICENCE_PRIVATE_KEY ?? '';
const TOKEN_SECRET = process.env.TOKEN_SECRET ?? '';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const BREVO_API_KEY = process.env.BREVO_API_KEY ?? '';
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'Fox Media <foxmedia.pub@hotmail.com>';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';
/** How many devices a single key may run on before it is considered shared. */
const DEVICE_LIMIT = Number(process.env.DEVICE_LIMIT ?? 2);

if (!PRIVATE_KEY_B64) throw new Error('LICENCE_PRIVATE_KEY manquant (npm run licence:keys)');
if (!TOKEN_SECRET) throw new Error('TOKEN_SECRET manquant');

const privateKey = {
  key: Buffer.from(PRIVATE_KEY_B64, 'base64'),
  format: 'der',
  type: 'pkcs8',
  dsaEncoding: 'ieee-p1363',
};

/* ------------------------------ tiny JSON store ------------------------------ */

let db = {
  createdAt: Date.now(),
  founderIssued: 0,
  /** email -> { email, hash, salt, referralCode, referredBy, referralsUsed, key, plan } */
  users: {},
  /** referralCode -> email */
  codes: {},
  /** licence id -> { email, name, plan, issuedAt, devices, revoked } */
  licences: {},
  /** device fingerprint -> licence id, so one device cannot drain free keys */
  freeKeyDevices: {},
};

async function loadDb() {
  try {
    db = { ...db, ...JSON.parse(await readFile(DB_FILE, 'utf8')) };
  } catch {
    await saveDb();
  }
}

let saving = Promise.resolve();
function saveDb() {
  saving = saving.then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(DB_FILE, JSON.stringify(db, null, 2));
  });
  return saving;
}

/* -------------------------------- licence keys -------------------------------- */

function base64Url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

/** FOX-<payload>-<signature>, verified in the app with the public key only. */
function issueKey({ email, plan, name }) {
  const payload = { id: randomUUID(), plan, email, name: name ?? '', issuedAt: Date.now() };
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const signer = createSign('SHA256');
  signer.update(bytes);
  const signature = signer.sign(privateKey);

  db.licences[payload.id] = {
    email,
    name: payload.name,
    plan,
    issuedAt: payload.issuedAt,
    devices: [],
    revoked: false,
  };
  return { key: `FOX-${base64Url(bytes)}-${base64Url(signature)}`, payload };
}

/** Reads the licence id out of a key without trusting it: the id must exist. */
function licenceOf(key) {
  const match = /^FOX-([A-Za-z0-9_-]+)-([A-Za-z0-9_-]+)$/.exec(String(key ?? '').trim());
  if (!match) return null;
  try {
    const payload = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
    const record = db.licences[payload.id];
    return record ? { id: payload.id, record } : null;
  } catch {
    return null;
  }
}

function fingerprint(device) {
  return createHmac('sha256', TOKEN_SECRET).update(String(device ?? '')).digest('hex').slice(0, 32);
}

/* --------------------------------- accounts --------------------------------- */

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}

function passwordMatches(user, password) {
  const attempt = Buffer.from(scryptSync(password, user.salt, 64).toString('hex'));
  const stored = Buffer.from(user.hash);
  return attempt.length === stored.length && timingSafeEqual(attempt, stored);
}

function signToken(email) {
  const body = base64Url(JSON.stringify({ email, at: Date.now() }));
  const mac = createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verifyToken(token) {
  const [body, mac] = String(token ?? '').split('.');
  if (!body || !mac) return null;
  const expected = createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')).email ?? null;
  } catch {
    return null;
  }
}

function referralOpen() {
  const end = REFERRAL_ENDS_AT
    ? Date.parse(REFERRAL_ENDS_AT)
    : db.createdAt + 30 * 86_400_000;
  return { open: Date.now() < end, endsAt: new Date(end).toISOString() };
}

function newReferralCode() {
  let code;
  do {
    code = randomBytes(4).toString('hex').toUpperCase();
  } while (db.codes[code]);
  return code;
}

function publicUser(user) {
  return {
    email: user.email,
    name: user.name ?? '',
    plan: user.plan ?? null,
    key: user.key ?? null,
    referralCode: user.referralCode,
    referralsUsed: user.referralsUsed,
    referralsLeft: Math.max(0, REFERRAL_LIMIT - user.referralsUsed),
  };
}

/* ---------------------------------- emails ---------------------------------- */

/** Splits "Fox Media <foxmedia.pub@hotmail.com>" into a name and an address. */
function parseSender(value) {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  return match
    ? { name: match[1] || 'Fox Media', email: match[2] }
    : { name: 'Fox Media', email: value.trim() };
}

function keyEmail(key, name) {
  const hello = name ? `Bonjour ${name},` : 'Bonjour,';
  const text = `${hello}

Voici votre cle Fox Media :

${key}

Collez-la dans Fox Media > Debloquer pour activer l'application.

L'equipe Fox Media`;
  const html = `<div style="font-family:system-ui,sans-serif;color:#12151c">
<p>${hello}</p>
<p>Voici votre cl&eacute; Fox Media :</p>
<p style="font-family:monospace;font-size:13px;word-break:break-all;background:#f2f3f7;padding:12px;border-radius:10px">${key}</p>
<p>Collez-la dans <b>Fox Media &gt; D&eacute;bloquer</b> pour activer l'application.</p>
<p>L'&eacute;quipe Fox Media 🦊</p>
</div>`;
  return { text, html };
}

/**
 * Emails a licence key. Brevo is tried first because it can send from your own
 * mailbox address once it is verified; Resend is the fallback.
 */
async function emailKey(to, key, plan, name = '') {
  if (!to) return;
  const label = plan === 'paid' ? 'Merci pour ton achat' : 'Ta cle gratuite Fox Media';
  const subject = `Fox Media 🦊 — ${label}`;
  const sender = parseSender(FROM_EMAIL);
  const { text, html } = keyEmail(key, name);

  if (BREVO_API_KEY) {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender,
        to: [{ email: to, name: name || undefined }],
        replyTo: sender,
        subject,
        htmlContent: html,
        textContent: text,
      }),
    }).catch((error) => {
      console.error('[mail] brevo unreachable:', error.message);
      return undefined;
    });
    if (response && !response.ok) {
      console.error('[mail] brevo refused:', response.status, await response.text());
    }
    return;
  }

  if (!RESEND_API_KEY) return;
  const resend = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, text, html }),
  }).catch((error) => {
    console.error('[mail] resend unreachable:', error.message);
    return undefined;
  });
  if (resend && !resend.ok) {
    console.error('[mail] resend refused:', resend.status, await resend.text());
  }
}

/* ---------------------------------- Stripe ---------------------------------- */

async function createCheckout(email) {
  if (!STRIPE_SECRET_KEY) throw new Error('Paiement non configuré');
  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(PRICE_CENTS),
    'line_items[0][price_data][product_data][name]': 'Fox Media — clé à vie',
    success_url: `${PUBLIC_URL}/merci?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${PUBLIC_URL}/annule`,
    'metadata[email]': email,
  });
  if (email) body.set('customer_email', email);

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? 'Stripe error');
  return data.url;
}

/** Verifies the Stripe-Signature header without pulling in the Stripe SDK. */
function stripeSignatureValid(rawBody, header) {
  if (!STRIPE_WEBHOOK_SECRET) return false;
  const parts = Object.fromEntries(
    String(header ?? '')
      .split(',')
      .map((part) => part.split('=')),
  );
  if (!parts.t || !parts.v1) return false;
  const expected = createHmac('sha256', STRIPE_WEBHOOK_SECRET)
    .update(`${parts.t}.${rawBody}`)
    .digest('hex');
  return parts.v1.length === expected.length &&
    timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
}

/* ----------------------------------- HTTP ----------------------------------- */

function send(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) request.destroy();
    });
    request.on('end', () => resolve(raw));
  });
}

async function grantKey(user, plan) {
  const { key } = issueKey({ email: user.email, plan, name: user.name });
  user.key = key;
  user.plan = plan;
  if (plan === 'founder') db.founderIssued += 1;
  await saveDb();
  await emailKey(user.email, key, plan, user.name ?? '');
  return key;
}

const routes = {
  'GET /stats': async (_request, _body) => {
    const referral = referralOpen();
    return {
      status: 200,
      payload: {
        priceCents: PRICE_CENTS,
        freeInstalls: FREE_INSTALLS,
        freeLeft: Math.max(0, FREE_INSTALLS - db.founderIssued),
        referralLimit: REFERRAL_LIMIT,
        referralOpen: referral.open,
        referralEndsAt: referral.endsAt,
      },
    };
  },

  'POST /signup': async (_request, body) => {
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const referral = String(body.referral ?? '').trim().toUpperCase();
    const name = String(body.name ?? '').trim().slice(0, 40);

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { status: 400, payload: { error: 'Email invalide' } };
    }
    if (password.length < 6) {
      return { status: 400, payload: { error: 'Mot de passe trop court (6 caractères mini)' } };
    }
    if (name.length < 2) {
      return { status: 400, payload: { error: 'Mets ton nom ou ton pseudo (2 caractères mini)' } };
    }
    if (db.users[email]) {
      return { status: 409, payload: { error: 'Ce compte existe déjà' } };
    }

    const { salt, hash } = hashPassword(password);
    const user = {
      email,
      name,
      salt,
      hash,
      referralCode: newReferralCode(),
      referredBy: null,
      referralsUsed: 0,
      key: null,
      plan: null,
      createdAt: Date.now(),
    };
    db.users[email] = user;
    db.codes[user.referralCode] = email;

    const programme = referralOpen();
    const sponsorEmail = referral ? db.codes[referral] : null;
    const sponsor = sponsorEmail ? db.users[sponsorEmail] : null;

    if (sponsor && programme.open && sponsor.referralsUsed < REFERRAL_LIMIT) {
      sponsor.referralsUsed += 1;
      user.referredBy = sponsor.email;
      await grantKey(user, 'referral');
    } else if (db.founderIssued < FREE_INSTALLS) {
      await grantKey(user, 'founder');
    } else {
      await saveDb();
    }

    return { status: 201, payload: { token: signToken(email), user: publicUser(user) } };
  },

  'POST /login': async (_request, body) => {
    const email = String(body.email ?? '').trim().toLowerCase();
    const user = db.users[email];
    if (!user || !passwordMatches(user, String(body.password ?? ''))) {
      return { status: 401, payload: { error: 'Email ou mot de passe incorrect' } };
    }
    return { status: 200, payload: { token: signToken(email), user: publicUser(user) } };
  },

  'GET /me': async (request) => {
    const email = verifyToken((request.headers.authorization ?? '').replace(/^Bearer /, ''));
    const user = email ? db.users[email] : null;
    if (!user) return { status: 401, payload: { error: 'Session expirée' } };
    return { status: 200, payload: { user: publicUser(user) } };
  },

  /**
   * Free founder key: one per device, and the holder must sign it with a name
   * or nickname that gets baked into the signed key.
   */
  'POST /free-key': async (_request, body) => {
    const name = String(body.name ?? '').trim().slice(0, 40);
    const device = fingerprint(body.device);
    if (name.length < 2) {
      return { status: 400, payload: { error: 'Mets ton nom ou ton pseudo pour signer ta clé' } };
    }
    if (!body.device) {
      return { status: 400, payload: { error: 'Appareil non identifié' } };
    }
    const address = String(body.email ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      return { status: 400, payload: { error: 'Mets une adresse email valide pour recevoir ta clé' } };
    }
    if (db.freeKeyDevices[device]) {
      return { status: 409, payload: { error: 'Cet appareil a déjà reçu une clé gratuite' } };
    }
    if (db.founderIssued >= FREE_INSTALLS) {
      return { status: 409, payload: { error: 'Les clés gratuites sont épuisées' } };
    }

    const holder = { email: address, name, plan: null, key: null };
    const key = await grantKey(holder, 'founder');
    const licence = licenceOf(key);
    db.freeKeyDevices[device] = licence?.id ?? null;
    if (licence) licence.record.devices = [device];
    await saveDb();
    return { status: 200, payload: { key } };
  },

  /**
   * Binds a key to the device running it. Keys shared around the internet run
   * out of device slots, and revoked keys stop working everywhere.
   */
  'POST /activate': async (_request, body) => {
    const licence = licenceOf(body.key);
    if (!licence) return { status: 404, payload: { error: 'Clé inconnue' } };
    if (licence.record.revoked) return { status: 403, payload: { error: 'Clé révoquée' } };

    const device = fingerprint(body.device);
    if (!body.device) return { status: 400, payload: { error: 'Appareil non identifié' } };

    const devices = licence.record.devices ?? [];
    if (!devices.includes(device)) {
      if (devices.length >= DEVICE_LIMIT) {
        return { status: 403, payload: { error: 'Clé déjà utilisée sur trop d\'appareils' } };
      }
      devices.push(device);
      licence.record.devices = devices;
      await saveDb();
    }
    return {
      status: 200,
      payload: { ok: true, name: licence.record.name ?? '', plan: licence.record.plan },
    };
  },

  /** Periodic re-check from the app: a revoked or unbound key is refused. */
  'POST /validate': async (_request, body) => {
    const licence = licenceOf(body.key);
    if (!licence) return { status: 404, payload: { error: 'Clé inconnue' } };
    const device = fingerprint(body.device);
    const known = (licence.record.devices ?? []).includes(device);
    if (licence.record.revoked || !known) {
      return { status: 403, payload: { ok: false, error: 'Clé non valide sur cet appareil' } };
    }
    return { status: 200, payload: { ok: true, name: licence.record.name ?? '' } };
  },

  /** Owner-only kill switch for a leaked key. */
  'POST /revoke': async (request, body) => {
    const provided = (request.headers.authorization ?? '').replace(/^Bearer /, '');
    const expected = ADMIN_TOKEN;
    const ok =
      expected &&
      provided.length === expected.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    if (!ok) return { status: 401, payload: { error: 'Non autorisé' } };

    const record = db.licences[String(body.id ?? '')];
    if (!record) return { status: 404, payload: { error: 'Licence inconnue' } };
    record.revoked = true;
    await saveDb();
    return { status: 200, payload: { ok: true } };
  },

  'POST /checkout': async (_request, body) => {
    try {
      const url = await createCheckout(String(body.email ?? '').trim().toLowerCase());
      return { status: 200, payload: { url } };
    } catch (error) {
      return { status: 400, payload: { error: error.message } };
    }
  },
};

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return send(response, 204, {});

  const url = new URL(request.url, PUBLIC_URL);
  const raw = request.method === 'POST' ? await readBody(request) : '';

  if (url.pathname === '/stripe/webhook' && request.method === 'POST') {
    if (!stripeSignatureValid(raw, request.headers['stripe-signature'])) {
      return send(response, 400, { error: 'Signature invalide' });
    }
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return send(response, 400, { error: 'Payload invalide' });
    }
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = (session.metadata?.email || session.customer_details?.email || '').toLowerCase();
      const user = db.users[email] ?? {
        email,
        name: session.customer_details?.name ?? '',
        plan: null,
        key: null,
      };
      await grantKey(user, 'paid');
    }
    return send(response, 200, { received: true });
  }

  const handler = routes[`${request.method} ${url.pathname}`];
  if (!handler) return send(response, 404, { error: 'Route inconnue' });

  let body = {};
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      return send(response, 400, { error: 'JSON invalide' });
    }
  }

  try {
    const { status, payload } = await handler(request, body);
    send(response, status, payload);
  } catch (error) {
    send(response, 500, { error: error.message });
  }
});

await loadDb();
server.listen(PORT, () => {
  console.log(`Fox Media licence server sur http://localhost:${PORT}`);
});
