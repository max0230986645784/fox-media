import { LICENCE_SERVER } from '../config';

export interface Account {
  email: string;
  /** Name or nickname signed into the licence key. */
  name: string;
  plan: 'paid' | 'founder' | 'referral' | null;
  key: string | null;
  referralCode: string;
  referralsUsed: number;
  referralsLeft: number;
}

export interface ServerStats {
  priceCents: number;
  freeInstalls: number;
  freeLeft: number;
  referralLimit: number;
  referralOpen: boolean;
  referralEndsAt: string;
}

const TOKEN_KEY = 'fox-media.token';

export function storedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage disabled */
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!LICENCE_SERVER) throw new Error("Serveur Fox Media non configuré");
  const response = await fetch(`${LICENCE_SERVER}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? 'Erreur serveur');
  return data;
}

/** Sign up with email + password only: no verification code, no email click. */
export async function signUp(
  email: string,
  password: string,
  referral: string,
  name: string,
): Promise<Account> {
  const data = await call<{ token: string; user: Account }>('/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, referral, name }),
  });
  storeToken(data.token);
  return data.user;
}

export async function signIn(email: string, password: string): Promise<Account> {
  const data = await call<{ token: string; user: Account }>('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  storeToken(data.token);
  return data.user;
}

export async function currentAccount(): Promise<Account | null> {
  const token = storedToken();
  if (!token) return null;
  try {
    const data = await call<{ user: Account }>('/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.user;
  } catch {
    storeToken(null);
    return null;
  }
}

export function signOut(): void {
  storeToken(null);
}

export async function serverStats(): Promise<ServerStats | null> {
  try {
    return await call<ServerStats>('/stats');
  } catch {
    return null;
  }
}

export async function checkoutUrl(email: string): Promise<string> {
  const data = await call<{ url: string }>('/checkout', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  return data.url;
}
