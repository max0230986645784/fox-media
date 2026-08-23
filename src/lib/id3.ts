import type { AudioTags } from '../types';

const HEADER_SIZE = 10;

/** Enough bytes to cover the ID3 tag and its embedded artwork on most files. */
export const TAG_READ_LENGTH = 3 * 1024 * 1024;

function decode(bytes: Uint8Array, encoding: number): string {
  switch (encoding) {
    case 1:
      return new TextDecoder('utf-16').decode(bytes);
    case 2:
      return new TextDecoder('utf-16be').decode(bytes);
    case 3:
      return new TextDecoder('utf-8').decode(bytes);
    default:
      return new TextDecoder('iso-8859-1').decode(bytes);
  }
}

function clean(value: string): string {
  return value.replace(/\0+$/g, '').trim();
}

function syncSafeInt(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 21) |
    (bytes[offset + 1] << 14) |
    (bytes[offset + 2] << 7) |
    bytes[offset + 3]
  );
}

function plainInt(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]
  );
}

function frameSize(bytes: Uint8Array, offset: number, majorVersion: number): number {
  return majorVersion >= 4 ? syncSafeInt(bytes, offset) : plainInt(bytes, offset);
}

/** Index of the string terminator, respecting 2-byte terminators for UTF-16. */
function terminatorIndex(bytes: Uint8Array, start: number, encoding: number): number {
  const wide = encoding === 1 || encoding === 2;
  for (let i = start; i < bytes.length; i += wide ? 2 : 1) {
    if (bytes[i] === 0 && (!wide || bytes[i + 1] === 0)) return i;
  }
  return bytes.length;
}

function toDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

/** APIC frame: encoding, mime, picture type, description, then the image bytes. */
function parseApic(bytes: Uint8Array): string | undefined {
  const encoding = bytes[0];
  const mimeEnd = terminatorIndex(bytes, 1, 0);
  const mime = clean(decode(bytes.subarray(1, mimeEnd), 0)) || 'image/jpeg';
  const descStart = mimeEnd + 2; // skip terminator + picture type
  const descEnd = terminatorIndex(bytes, descStart, encoding);
  const dataStart = descEnd + (encoding === 1 || encoding === 2 ? 2 : 1);
  if (dataStart >= bytes.length) return undefined;
  return toDataUrl(bytes.subarray(dataStart), mime.startsWith('image/') ? mime : 'image/jpeg');
}

function parseV1(bytes: Uint8Array): AudioTags {
  const text = (start: number, length: number) =>
    clean(decode(bytes.subarray(start, start + length), 0));
  return {
    title: text(3, 30) || undefined,
    artist: text(33, 30) || undefined,
    album: text(63, 30) || undefined,
    year: text(93, 4) || undefined,
  };
}

/**
 * Reads ID3v2 tags (title, artist, album, year, cover art as a data URL) from
 * the head of an audio file, falling back to an ID3v1 block when present.
 */
export function parseAudioTags(head: Uint8Array, tail?: Uint8Array): AudioTags {
  const isV2 = head.length >= HEADER_SIZE && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33;
  if (!isV2) {
    const isV1 = tail && tail.length >= 128 && tail[0] === 0x54 && tail[1] === 0x41 && tail[2] === 0x47;
    return isV1 ? parseV1(tail) : {};
  }

  const majorVersion = head[3];
  const tagSize = syncSafeInt(head, 6);
  const body = head.subarray(HEADER_SIZE, Math.min(head.length, HEADER_SIZE + tagSize));
  const tags: AudioTags = {};

  let offset = 0;
  while (offset + HEADER_SIZE <= body.length) {
    const id = decode(body.subarray(offset, offset + 4), 0);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const size = frameSize(body, offset + 4, majorVersion);
    if (size <= 0 || offset + HEADER_SIZE + size > body.length) break;
    const content = body.subarray(offset + HEADER_SIZE, offset + HEADER_SIZE + size);
    const text = () => clean(decode(content.subarray(1), content[0]));

    switch (id) {
      case 'TIT2':
        tags.title = text() || undefined;
        break;
      case 'TPE1':
        tags.artist = text() || undefined;
        break;
      case 'TALB':
        tags.album = text() || undefined;
        break;
      case 'TYER':
      case 'TDRC':
        tags.year = text().slice(0, 4) || undefined;
        break;
      case 'APIC':
        if (!tags.cover) tags.cover = parseApic(content);
        break;
      default:
        break;
    }
    offset += HEADER_SIZE + size;
  }

  return tags;
}

export async function readAudioTags(file: File): Promise<AudioTags> {
  const head = new Uint8Array(await file.slice(0, TAG_READ_LENGTH).arrayBuffer());
  const tail =
    file.size >= 128 ? new Uint8Array(await file.slice(file.size - 128).arrayBuffer()) : undefined;
  return parseAudioTags(head, tail);
}
