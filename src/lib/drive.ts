import { GOOGLE_CLIENT_ID } from '../config';
import type { MediaItem } from '../types';

/**
 * Optional backup of the library *description* (titles, artists, covers,
 * paths) to the user's own Google Drive. Media files never leave the device.
 */

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'fox-media-library.json';

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

interface GoogleIdentity {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: { access_token?: string; error?: string }) => void;
      }) => TokenClient;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

function loadIdentityScript(): Promise<GoogleIdentity> {
  if (window.google) return Promise.resolve(window.google);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () =>
      window.google ? resolve(window.google) : reject(new Error('Google indisponible'));
    script.onerror = () => reject(new Error('Google indisponible'));
    document.head.append(script);
  });
}

/** One Google consent click, then a token valid for the session. */
export async function driveToken(): Promise<string> {
  if (!GOOGLE_CLIENT_ID) throw new Error('Google Drive non configuré');
  const google = await loadIdentityScript();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (response) => {
        if (response.access_token) resolve(response.access_token);
        else reject(new Error(response.error ?? 'Autorisation refusée'));
      },
    });
    client.requestAccessToken();
  });
}

async function findBackupId(token: string): Promise<string | null> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent(
      `name='${FILE_NAME}'`,
    )}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error('Drive: lecture impossible');
  const data = (await response.json()) as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
}

export async function backupToDrive(items: MediaItem[]): Promise<number> {
  const token = await driveToken();
  const existing = await findBackupId(token);
  const metadata = existing ? {} : { name: FILE_NAME, parents: ['appDataFolder'] };

  const boundary = 'fox-media-boundary';
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ savedAt: Date.now(), items }),
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const response = await fetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!response.ok) throw new Error('Drive: sauvegarde impossible');
  return items.length;
}

export async function restoreFromDrive(): Promise<MediaItem[]> {
  const token = await driveToken();
  const existing = await findBackupId(token);
  if (!existing) return [];

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${existing}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error('Drive: restauration impossible');
  const data = (await response.json()) as { items?: MediaItem[] };
  return data.items ?? [];
}
