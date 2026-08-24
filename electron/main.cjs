const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const DIST = path.join(__dirname, '..', 'dist');

const MEDIA_EXTENSIONS = new Set([
  '.mp4', '.m4v', '.webm', '.ogv', '.mov', '.mkv', '.avi',
  '.mp3', '.m4a', '.aac', '.wav', '.ogg', '.oga', '.opus', '.flac',
]);

const MIME_TYPES = new Map([
  ['.mp4', 'video/mp4'],
  ['.m4v', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.ogv', 'video/ogg'],
  ['.mov', 'video/quicktime'],
  ['.mkv', 'video/x-matroska'],
  ['.avi', 'video/x-msvideo'],
  ['.mp3', 'audio/mpeg'],
  ['.m4a', 'audio/mp4'],
  ['.aac', 'audio/aac'],
  ['.wav', 'audio/wav'],
  ['.ogg', 'audio/ogg'],
  ['.oga', 'audio/ogg'],
  ['.opus', 'audio/opus'],
  ['.flac', 'audio/flac'],
]);

/** Web stream over a slice of a file, so huge movies stream instead of loading. */
function streamOf(target, start, end) {
  const reader = fs.createReadStream(target, start === undefined ? {} : { start, end });
  return new ReadableStream({
    start(controller) {
      reader.on('data', (chunk) => {
        controller.enqueue(new Uint8Array(chunk));
        // Backpressure: stop reading until the renderer consumed the chunk.
        if (controller.desiredSize !== null && controller.desiredSize <= 0) reader.pause();
      });
      reader.on('end', () => controller.close());
      reader.on('error', (error) => controller.error(error));
    },
    pull() {
      reader.resume();
    },
    cancel() {
      reader.destroy();
    },
  });
}

const MAX_DEPTH = 8;
const MAX_ENTRIES = 20000;

/** ffmpeg binary shipped next to the app (MKV/AVI/H.265 playback). */
function ffmpegPath() {
  const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const packaged = path.join(process.resourcesPath ?? '', name);
  if (fs.existsSync(packaged)) return packaged;
  try {
    const local = require('ffmpeg-static');
    return typeof local === 'string' && fs.existsSync(local) ? local : null;
  } catch {
    return null;
  }
}

/**
 * Streams a file Chromium cannot decode (MKV, AVI, H.265, AC3 audio…) as a
 * fragmented MP4, starting at `at` seconds so seeking works. With `copyVideo`
 * the video track is only repackaged (instant, works for H.264 inside MKV);
 * otherwise it is re-encoded to H.264, which any machine can play.
 */
function transcodeStream(target, at, copyVideo) {
  const binary = ffmpegPath();
  if (!binary) return null;

  const child = spawn(
    binary,
    [
      '-hide_banner',
      '-loglevel', 'error',
      ...(at > 0 ? ['-ss', String(at)] : []),
      '-i', target,
      '-map', '0:v:0?',
      '-map', '0:a:0?',
      ...(copyVideo ? ['-c:v', 'copy'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23']),
      '-c:a', 'aac',
      '-ac', '2',
      '-b:a', '192k',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4',
      'pipe:1',
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );

  return new ReadableStream({
    start(controller) {
      child.stdout.on('data', (chunk) => {
        controller.enqueue(new Uint8Array(chunk));
        if (controller.desiredSize !== null && controller.desiredSize <= 0) child.stdout.pause();
      });
      child.stdout.on('end', () => {
        try {
          controller.close();
        } catch {
          // Already closed by a cancelled request.
        }
      });
      child.on('error', () => controller.error(new Error('ffmpeg failed')));
    },
    pull() {
      child.stdout.resume();
    },
    cancel() {
      child.kill('SIGKILL');
    },
  });
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'fox-app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'fox-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
]);

/** Folders the user explicitly picked; only files below them can be served. */
const allowedRoots = new Set();

function isAllowed(target) {
  const resolved = path.resolve(target);
  for (const root of allowedRoots) {
    if (resolved === root || resolved.startsWith(root + path.sep)) return true;
  }
  return false;
}

async function walk(root) {
  const entries = [];
  const queue = [{ dir: root, depth: 0 }];

  while (queue.length > 0 && entries.length < MAX_ENTRIES) {
    const { dir, depth } = queue.shift();
    let dirents;
    try {
      dirents = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const dirent of dirents) {
      if (dirent.name.startsWith('.')) continue;
      const full = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        if (depth < MAX_DEPTH) queue.push({ dir: full, depth: depth + 1 });
        continue;
      }
      if (!dirent.isFile()) continue;
      if (!MEDIA_EXTENSIONS.has(path.extname(dirent.name).toLowerCase())) continue;
      try {
        const stat = await fsp.stat(full);
        entries.push({
          path: full,
          name: dirent.name,
          size: stat.size,
          lastModified: Math.round(stat.mtimeMs),
        });
      } catch {
        continue;
      }
      if (entries.length >= MAX_ENTRIES) break;
    }
  }

  return entries;
}

function registerProtocols() {
  protocol.handle('fox-app', (request) => {
    const url = new URL(request.url);
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const target = path.join(DIST, relative);
    const safe = target.startsWith(DIST) ? target : path.join(DIST, 'index.html');
    const file = fs.existsSync(safe) ? safe : path.join(DIST, 'index.html');
    return net.fetch(pathToFileURL(file).toString());
  });

  // Range-aware file streaming: needed so seeking works on very large movies
  // (a 10-hour file is never loaded in memory, only the requested slice).
  protocol.handle('fox-media', async (request) => {
    const url = new URL(request.url);
    const target = decodeURIComponent(url.searchParams.get('path') ?? '');
    if (!target || !isAllowed(target)) return new Response('Forbidden', { status: 403 });

    let stat;
    try {
      stat = await fsp.stat(target);
    } catch {
      return new Response('Not found', { status: 404 });
    }

    // Formats Chromium cannot decode go through ffmpeg instead.
    const convert = url.searchParams.get('convert');
    if (convert === 'copy' || convert === '1') {
      const at = Number(url.searchParams.get('at') ?? '0');
      const stream = transcodeStream(target, Number.isFinite(at) && at > 0 ? at : 0, convert === 'copy');
      if (!stream) return new Response('ffmpeg missing', { status: 501 });
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'none', 'Cache-Control': 'no-store' },
      });
    }

    const type = MIME_TYPES.get(path.extname(target).toLowerCase()) ?? 'application/octet-stream';
    const range = request.headers.get('Range');
    const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;

    if (!match) {
      return new Response(streamOf(target), {
        status: 200,
        headers: {
          'Content-Type': type,
          'Content-Length': String(stat.size),
          'Accept-Ranges': 'bytes',
        },
      });
    }

    const start = match[1] === '' ? Math.max(0, stat.size - Number(match[2])) : Number(match[1]);
    const end = match[1] === '' || match[2] === '' ? stat.size - 1 : Math.min(Number(match[2]), stat.size - 1);
    if (Number.isNaN(start) || start >= stat.size || end < start) {
      return new Response('Range not satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${stat.size}` },
      });
    }

    return new Response(streamOf(target, start, end), {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
      },
    });
  });
}

/** Folder every download lands in, next to the user's own videos. */
function downloadDir() {
  let base;
  try {
    base = app.getPath('videos');
  } catch {
    base = app.getPath('userData');
  }
  return path.join(base, 'Fox Media');
}

const YTDLP_URLS = {
  win32: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
  darwin: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
  linux: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux',
};

/**
 * Helper used to grab a video from a page (TikTok, a course player…). It is
 * fetched on first use only, so an offline install never downloads anything.
 */
async function ytdlpBinary() {
  const name = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const target = path.join(app.getPath('userData'), 'bin', name);
  if (fs.existsSync(target)) return target;

  const source = YTDLP_URLS[process.platform];
  if (!source) return null;
  const response = await fetch(source);
  if (!response.ok || !response.body) return null;

  await fsp.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.part`;
  await fsp.writeFile(temporary, Buffer.from(await response.arrayBuffer()));
  await fsp.rename(temporary, target);
  if (process.platform !== 'win32') await fsp.chmod(target, 0o755);
  return target;
}

function safeName(name) {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 120) || 'video';
}

/** Direct file links are downloaded as-is, which also works for audio. */
async function downloadDirect(url, dir, onProgress) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Téléchargement refusé (${response.status})`);

  const disposition = response.headers.get('Content-Disposition') ?? '';
  const fromHeader = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1];
  const fromUrl = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
  let name = safeName(fromHeader ?? fromUrl);
  if (!MEDIA_EXTENSIONS.has(path.extname(name).toLowerCase())) {
    const type = response.headers.get('Content-Type') ?? '';
    name += type.startsWith('audio/') ? '.mp3' : '.mp4';
  }

  const total = Number(response.headers.get('Content-Length') ?? '0');
  const target = path.join(dir, name);
  const handle = await fsp.open(target, 'w');
  let written = 0;
  try {
    for await (const chunk of response.body) {
      await handle.write(chunk);
      written += chunk.length;
      if (total > 0) onProgress(Math.min(99, Math.round((written / total) * 100)));
    }
  } finally {
    await handle.close();
  }
  return target;
}

/** Pages are handed to yt-dlp, which finds the real video stream. */
async function downloadPage(url, dir, onProgress) {
  const binary = await ytdlpBinary();
  if (!binary) throw new Error("Ce lien n'est pas un fichier vidéo direct");

  const ffmpeg = ffmpegPath();
  const args = [
    '--no-playlist',
    '--newline',
    '--no-part',
    '-f', 'bv*+ba/b',
    '--merge-output-format', 'mp4',
    ...(ffmpeg ? ['--ffmpeg-location', path.dirname(ffmpeg)] : []),
    '--print', 'after_move:filepath',
    '-o', path.join(dir, '%(title).120B.%(ext)s'),
    url,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let produced = '';
    let error = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (text) => {
      for (const line of text.split('\n')) {
        const percent = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(line);
        if (percent) onProgress(Math.min(99, Math.round(Number(percent[1]))));
        else if (line.trim() && !line.startsWith('[')) produced = line.trim();
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text) => {
      error += text;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && produced) resolve(produced);
      else reject(new Error(error.split('\n').find((line) => line.includes('ERROR')) ?? 'Téléchargement impossible'));
    });
  });
}

function registerIpc() {
  /**
   * Downloads the video behind a pasted link into the Fox Media folder and
   * returns the entry the library needs, so it appears right away.
   */
  ipcMain.handle('fox:download', async (event, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('Lien invalide');

    const dir = downloadDir();
    await fsp.mkdir(dir, { recursive: true });
    allowedRoots.add(path.resolve(dir));

    const onProgress = (percent) => {
      if (!event.sender.isDestroyed()) event.sender.send('fox:download-progress', percent);
    };

    const direct = MEDIA_EXTENSIONS.has(path.extname(new URL(url).pathname).toLowerCase());
    const target = direct
      ? await downloadDirect(url, dir, onProgress)
      : await downloadPage(url, dir, onProgress);

    const stat = await fsp.stat(target);
    onProgress(100);
    return {
      path: target,
      name: path.basename(target),
      size: stat.size,
      lastModified: stat.mtimeMs,
    };
  });

  ipcMain.handle('fox:open-folder', async () => {
    const dir = downloadDir();
    await fsp.mkdir(dir, { recursive: true });
    await shell.openPath(dir);
  });


  ipcMain.handle('fox:pick-folder', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window, {
      title: 'Choisir un dossier à scanner',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const folder = path.resolve(result.filePaths[0]);
    allowedRoots.add(folder);
    return { folder, entries: await walk(folder) };
  });

  ipcMain.handle('fox:pick-files', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window, {
      title: 'Choisir des fichiers',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Médias', extensions: [...MEDIA_EXTENSIONS].map((ext) => ext.slice(1)) }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const entries = [];
    for (const file of result.filePaths) {
      const full = path.resolve(file);
      allowedRoots.add(path.dirname(full));
      try {
        const stat = await fsp.stat(full);
        entries.push({
          path: full,
          name: path.basename(full),
          size: stat.size,
          lastModified: Math.round(stat.mtimeMs),
        });
      } catch {
        continue;
      }
    }
    return { folder: path.dirname(entries[0]?.path ?? ''), entries };
  });

  ipcMain.handle('fox:read-range', async (_event, target, start, length) => {
    if (typeof target !== 'string' || !isAllowed(target)) throw new Error('Fichier non autorisé');
    const handle = await fsp.open(target, 'r');
    try {
      const buffer = Buffer.alloc(Math.max(0, Math.min(length, 8 * 1024 * 1024)));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, Math.max(0, start));
      return new Uint8Array(buffer.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  });

  ipcMain.handle('fox:store-read', async () => {
    try {
      return await fsp.readFile(storeFile(), 'utf8');
    } catch {
      return null;
    }
  });

  ipcMain.handle('fox:store-write', async (_event, contents) => {
    await fsp.mkdir(path.dirname(storeFile()), { recursive: true });
    await fsp.writeFile(storeFile(), String(contents), 'utf8');
  });

  ipcMain.handle('fox:open-external', async (_event, url) => {
    if (typeof url === 'string' && /^(https:\/\/|mailto:)/.test(url)) await shell.openExternal(url);
  });
}

function storeFile() {
  return path.join(app.getPath('userData'), 'licence.json');
}

/**
 * Downloads a newer release from GitHub and installs it on quit, so users update
 * in place instead of uninstalling first. Silently skipped when packaging or
 * network access is unavailable.
 */
function checkForUpdates() {
  if (!app.isPackaged) return;
  let updater;
  try {
    updater = require('electron-updater').autoUpdater;
  } catch {
    return;
  }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('error', () => {});
  updater.on('update-downloaded', async (info) => {
    const answer = await dialog.showMessageBox({
      type: 'info',
      title: 'Mise à jour Fox Media',
      message: `La version ${info.version} est prête.`,
      detail: "Installer maintenant ? Aucune désinstallation n'est nécessaire.",
      buttons: ['Installer et redémarrer', 'Plus tard'],
      defaultId: 0,
      cancelId: 1,
    });
    if (answer.response === 0) updater.quitAndInstall();
  });
  void updater.checkForUpdates().catch(() => {});
}

function createWindow() {
  const window = new BrowserWindow({
    // Phone-shaped window so the desktop build looks exactly like the Android app.
    width: 430,
    height: 900,
    minWidth: 380,
    minHeight: 640,
    backgroundColor: '#0d1016',
    autoHideMenuBar: true,
    title: 'Fox Media',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (DEV_SERVER_URL) void window.loadURL(DEV_SERVER_URL);
  else void window.loadURL('fox-app://local/index.html');

  return window;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [existing] = BrowserWindow.getAllWindows();
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
    }
  });

  void app.whenReady().then(() => {
    registerProtocols();
    registerIpc();
    createWindow();
    checkForUpdates();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
