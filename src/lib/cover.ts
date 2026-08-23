const PALETTES = [
  ['#ff8a3d', '#c62b00'],
  ['#4d9bff', '#0b3fb0'],
  ['#2ee08a', '#046b45'],
  ['#ff5f9e', '#a1005e'],
  ['#a78bfa', '#4c1d95'],
  ['#ffd93d', '#b26b00'],
  ['#22d3ee', '#0e5f8a'],
  ['#f87171', '#7f1d1d'],
];

function hash(value: string): number {
  let total = 0;
  for (let index = 0; index < value.length; index += 1) {
    total = (total * 31 + value.charCodeAt(index)) % 100000;
  }
  return total;
}

/** Colourful stand-in artwork for media that has no embedded cover. */
export function fallbackCover(seed: string): string {
  const [from, to] = PALETTES[hash(seed) % PALETTES.length];
  return `linear-gradient(135deg, ${from}, ${to})`;
}

/** One or two letters used on top of the generated artwork. */
export function coverInitials(title: string): string {
  const words = title
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .split(' ')
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
