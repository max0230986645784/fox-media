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

function registerIpc() {
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
