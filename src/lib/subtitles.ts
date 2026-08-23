/** Converts a SubRip (.srt) file into the WebVTT syntax <track> understands. */
export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/\r+/g, '')
    .replace(/^\uFEFF/, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return `WEBVTT\n\n${body.trim()}\n`;
}

function stamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const rest = clamped % 60;
  const pad = (value: number) => String(Math.floor(value)).padStart(2, '0');
  const millis = String(Math.round((rest % 1) * 1000)).padStart(3, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(rest)}.${millis}`;
}

/** Shifts every cue of a WebVTT track, for subtitles out of sync. */
export function shiftVtt(vtt: string, offset: number): string {
  if (!offset) return vtt;
  return vtt.replace(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/g, (_, h, m, s, ms) => {
    const seconds = Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
    return stamp(seconds + offset);
  });
}
