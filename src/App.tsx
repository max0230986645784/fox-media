import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MediaItem, SortKey } from './types';
import { useLibrary } from './hooks/useLibrary';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useMediaSession } from './hooks/useMediaSession';
import { useLicence } from './hooks/useLicence';
import { useAccount } from './hooks/useAccount';
import { useTheme } from './hooks/useTheme';
import { useEqualizer } from './hooks/useEqualizer';
import { usePlaylists } from './hooks/usePlaylists';
import { useWallet } from './hooks/useWallet';
import { byAlbum, byArtist, byFolder } from './lib/group';
import { resumable } from './lib/resume';
import { filesFromDataTransfer } from './lib/scan';
import { AdBanner } from './components/AdBanner';
import { InstallPrompt } from './components/InstallPrompt';
import { WalletSheet } from './components/WalletSheet';
import { LarkHeader } from './components/LarkHeader';
import type { Tab } from './components/LarkHeader';
import { ImportButtons } from './components/ImportButtons';
import { DownloadDialog } from './components/DownloadDialog';
import { SongList } from './components/SongList';
import { VideoList } from './components/VideoList';
import { GroupList } from './components/GroupList';
import { PlaylistsView } from './components/PlaylistsView';
import { ContinueRow } from './components/ContinueRow';
import { MiniPlayer } from './components/MiniPlayer';
import { FullPlayer } from './components/FullPlayer';
import { EqualizerSheet } from './components/EqualizerSheet';
import { SettingsSheet } from './components/SettingsSheet';
import { TrackMenu } from './components/TrackMenu';
import { VideoPlayer } from './components/VideoPlayer';
import { MetadataDialog } from './components/MetadataDialog';
import { ScanPicker } from './components/ScanPicker';
import { LicenceDialog } from './components/LicenceDialog';
import { AccountDialog } from './components/AccountDialog';
import { ShareDialog } from './components/ShareDialog';
import { Icon } from './components/Icon';
import { NOADS_PLANS, OWNER_CODE } from './config';
import './App.css';

function compare(a: MediaItem, b: MediaItem, sort: SortKey): number {
  switch (sort) {
    case 'title':
      return a.title.localeCompare(b.title, 'fr');
    case 'artist':
      return (a.artist || 'zzz').localeCompare(b.artist || 'zzz', 'fr');
    case 'size':
      return b.size - a.size;
    default:
      return (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt);
  }
}

interface Focus {
  title: string;
  ids: string[];
}

export default function App() {
  const library = useLibrary();
  const player = useAudioPlayer(library);
  const licence = useLicence();
  const accountApi = useAccount();
  const theme = useTheme();
  const playlists = usePlaylists();
  const wallet = useWallet();
  const equalizer = useEqualizer(player.audioRef.current);

  const [tab, setTab] = useState<Tab>('videos');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [focus, setFocus] = useState<Focus | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [fullPlayer, setFullPlayer] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [eqOpen, setEqOpen] = useState(false);
  const [licenceOpen, setLicenceOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null);
  const [walletOpen, setWalletOpen] = useState(false);

  const { items, updateItem, removeItem, urlFor, isAvailable } = library;
  const locked = licence.ready && !licence.unlocked;

  const match = useCallback(
    (item: MediaItem) => {
      const needle = query.trim().toLowerCase();
      if (needle.length === 0) return true;
      return `${item.title} ${item.artist} ${item.album} ${item.fileName}`
        .toLowerCase()
        .includes(needle);
    },
    [query],
  );

  const videos = useMemo(
    () => items.filter((item) => item.kind === 'video' && match(item)).sort((a, b) => compare(a, b, sort)),
    [items, match, sort],
  );

  const songs = useMemo(
    () => items.filter((item) => item.kind === 'audio' && match(item)).sort((a, b) => compare(a, b, sort)),
    [items, match, sort],
  );

  const focused = useMemo(() => {
    if (!focus) return [];
    return focus.ids
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is MediaItem => Boolean(item))
      .sort((a, b) => compare(a, b, sort));
  }, [focus, items, sort]);

  const accountKey = accountApi.account?.key ?? null;
  useEffect(() => {
    if (accountKey && !licence.licence) void licence.activate(accountKey);
  }, [accountKey, licence]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (sleepMinutes === null) return;
    const timer = window.setTimeout(() => {
      player.stop();
      setSleepMinutes(null);
      setToast('Minuteur : lecture arrêtée');
    }, sleepMinutes * 60_000);
    return () => window.clearTimeout(timer);
  }, [sleepMinutes, player]);

  // Lock screen, notification and headset buttons follow the current track.
  useMediaSession(player.current, player.isPlaying, {
    play: player.toggle,
    pause: player.pause,
    next: player.next,
    previous: player.previous,
    seek: player.seek,
  });

  const handleFiles = useCallback(
    async (picked: File[]) => {
      if (locked) {
        setLicenceOpen(true);
        return;
      }
      await library.scanFilesForPreview(picked);
    },
    [library, locked],
  );

  const handleNative = useCallback(
    (mode: 'folder' | 'files') => {
      if (locked) {
        setLicenceOpen(true);
        return;
      }
      void library.scanNativeForPreview(mode);
    },
    [library, locked],
  );

  const editing = editingId ? (items.find((item) => item.id === editingId) ?? null) : null;
  const menuItem = menuId ? (items.find((item) => item.id === menuId) ?? null) : null;
  const playingVideo = videoId ? (items.find((item) => item.id === videoId) ?? null) : null;
  const videoUrl = playingVideo ? urlFor(playingVideo.id) : null;
  const videoPosition = playingVideo ? videos.findIndex((item) => item.id === playingVideo.id) : -1;

  const toggleFavorite = useCallback(
    (id: string) => {
      const item = items.find((entry) => entry.id === id);
      if (item) updateItem(id, { favorite: !item.favorite });
    },
    [items, updateItem],
  );

  const onThumbnail = useCallback(
    (id: string, cover: string, duration: number) => {
      updateItem(id, { cover, duration: duration > 0 ? duration : null });
    },
    [updateItem],
  );

  const playSongs = useCallback(
    (list: MediaItem[], startId?: string) => {
      player.playList(
        list.filter((item) => isAvailable(item.id)).map((item) => item.id),
        startId,
      );
    },
    [isAvailable, player],
  );

  const shuffleAll = useCallback(
    (list: MediaItem[]) => {
      if (!player.shuffle) player.toggleShuffle();
      playSongs(list);
    },
    [playSongs, player],
  );

  const songScreen = (list: MediaItem[]) => (
    <SongList
      items={list}
      current={player.current}
      isPlaying={player.isPlaying}
      isAvailable={isAvailable}
      onPlay={(id) => playSongs(list, id)}
      onMenu={setMenuId}
      onShuffleAll={() => shuffleAll(list)}
    />
  );

  const videoScreen = (list: MediaItem[]) => (
    <VideoList
      items={list}
      urlFor={urlFor}
      isAvailable={isAvailable}
      onPlay={setVideoId}
      onMenu={setMenuId}
      onThumbnail={onThumbnail}
    />
  );

  const currentScreen = () => {
    if (focus) {
      const onlyVideos = focused.every((item) => item.kind === 'video');
      return (
        <>
          <div className="focus-head">
            <button type="button" className="icon-button" onClick={() => setFocus(null)} title="Retour">
              <Icon name="back" size={22} />
            </button>
            <h2>{focus.title}</h2>
          </div>
          {focused.length === 0 ? (
            <p className="hint">Cette liste est vide pour l'instant.</p>
          ) : onlyVideos ? (
            videoScreen(focused)
          ) : (
            songScreen(focused)
          )}
        </>
      );
    }

    switch (tab) {
      case 'videos':
        return videos.length > 0 ? (
          <>
            <ContinueRow items={resumable(videos)} onPlay={(item) => setVideoId(item.id)} />
            {videoScreen(videos)}
          </>
        ) : (
          <Empty label="Aucune vidéo" />
        );
      case 'songs':
        return songs.length > 0 ? (
          <>
            <ContinueRow items={resumable(songs)} onPlay={(item) => playSongs(songs, item.id)} />
            {songScreen(songs)}
          </>
        ) : (
          <Empty label="Aucune musique" />
        );
      case 'playlists':
        return (
          <PlaylistsView
            api={playlists}
            items={items}
            favorites={items.filter((item) => item.favorite)}
            onOpen={(title, ids) => setFocus({ title, ids })}
          />
        );
      case 'folders':
        return (
          <GroupList
            groups={byFolder([...videos, ...songs])}
            icon="folder"
            onOpen={(group) =>
              setFocus({ title: group.label, ids: group.items.map((item) => item.id) })
            }
          />
        );
      case 'artists':
        return (
          <GroupList
            groups={byArtist(songs)}
            icon="artist"
            onOpen={(group) =>
              setFocus({ title: group.label, ids: group.items.map((item) => item.id) })
            }
          />
        );
      default:
        return (
          <GroupList
            groups={byAlbum(songs)}
            icon="album"
            onOpen={(group) =>
              setFocus({ title: group.label, ids: group.items.map((item) => item.id) })
            }
          />
        );
    }
  };

  return (
    <div
      className={dragging ? 'app dragging' : 'app'}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void filesFromDataTransfer(event.dataTransfer).then(handleFiles);
      }}
    >
      <LarkHeader
        tab={tab}
        onTab={(next) => {
          setFocus(null);
          setTab(next);
        }}
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        referralDaysLeft={accountApi.referralDaysLeft}
        onSettings={() => setSettingsOpen(true)}
      />

      {licence.ready && !licence.adsFree && (
        <p className="notice licence-notice">
          Fox Media est gratuit et marche sans réseau.{' '}
          <button type="button" className="link" onClick={() => setLicenceOpen(true)}>
            Enlever les pubs dès {NOADS_PLANS[0].price} €
          </button>
        </p>
      )}

      <InstallPrompt />

      {licence.ready && !licence.adsFree && <AdBanner />}

      {library.missingCount > 0 && (
        <p className="notice">
          {library.missingCount} média(s) de ta bibliothèque ne sont pas chargés dans cet onglet :
          relance un scan du dossier pour pouvoir les lire (les titres et images sont conservés).
        </p>
      )}

      <main className={player.current ? 'content with-player' : 'content'}>
        {items.length === 0 ? (
          <section className="empty">
            <img className="empty-logo" src="icon-192.png" alt="" />
            <h1>Bienvenue sur Fox Media</h1>
            <p>
              Scanne un dossier de ton PC ou de ton téléphone, choisis tes films et tes musiques,
              et corrige les titres, les artistes ou les pochettes qui manquent.
            </p>
            <ImportButtons
              onFiles={handleFiles}
              onNative={handleNative}
              onLink={() => setDownloadOpen(true)}
              scanning={library.scanning}
            />
            <p className="hint">Tu peux aussi glisser-déposer un dossier ici.</p>
          </section>
        ) : (
          currentScreen()
        )}
      </main>

      {player.current && !fullPlayer && (
        <MiniPlayer player={player} onExpand={() => setFullPlayer(true)} />
      )}

      {player.current && fullPlayer && (
        <FullPlayer
          player={player}
          equalizer={equalizer}
          items={items}
          onClose={() => setFullPlayer(false)}
          onEdit={setEditingId}
          onToggleFavorite={toggleFavorite}
          onLyrics={(id, lyrics) => updateItem(id, { lyrics })}
          onEqualizer={() => setEqOpen(true)}
        />
      )}

      <audio
        ref={player.audioRef}
        onTimeUpdate={player.onTimeUpdate}
        onLoadedMetadata={player.onLoadedMetadata}
        onEnded={player.onEnded}
        hidden
      />

      {playingVideo && videoUrl && (
        <VideoPlayer
          item={playingVideo}
          url={videoUrl}
          hasPrevious={videoPosition > 0}
          hasNext={videoPosition >= 0 && videoPosition < videos.length - 1}
          onPrevious={() => setVideoId(videos[videoPosition - 1]?.id ?? null)}
          onNext={() => setVideoId(videos[videoPosition + 1]?.id ?? null)}
          onProgress={(seconds, duration) =>
            updateItem(playingVideo.id, {
              progress: seconds,
              duration: Number.isFinite(duration) ? duration : playingVideo.duration,
              playCount: playingVideo.playCount + (seconds === 0 ? 1 : 0),
            })
          }
          onClose={() => setVideoId(null)}
        />
      )}

      {settingsOpen && (
        <SettingsSheet
          theme={theme}
          scanning={library.scanning}
          onFiles={(files) => {
            setSettingsOpen(false);
            void handleFiles(files);
          }}
          onNative={(mode) => {
            setSettingsOpen(false);
            handleNative(mode);
          }}
          onLink={() => {
            setSettingsOpen(false);
            setDownloadOpen(true);
          }}
          onEqualizer={() => {
            setSettingsOpen(false);
            setEqOpen(true);
          }}
          onLicence={() => {
            setSettingsOpen(false);
            setLicenceOpen(true);
          }}
          onAccount={() => {
            setSettingsOpen(false);
            setAccountOpen(true);
          }}
          onShare={() => {
            setSettingsOpen(false);
            setShareOpen(true);
          }}
          sleepMinutes={sleepMinutes}
          onSleep={setSleepMinutes}
          licenceLabel={
            licence.licence
              ? `Licence de ${licence.licence.payload.name || licence.licence.payload.email || 'Fox Media'}`
              : ''
          }
          onOwner={(code) => {
            if (code !== OWNER_CODE) {
              setToast('Code incorrect.');
              return false;
            }
            setSettingsOpen(false);
            setWalletOpen(true);
            return true;
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {walletOpen && <WalletSheet wallet={wallet} onClose={() => setWalletOpen(false)} />}

      {eqOpen && (
        <EqualizerSheet
          eq={equalizer}
          current={player.current}
          isPlaying={player.isPlaying}
          onToggle={player.toggle}
          onClose={() => setEqOpen(false)}
        />
      )}

      {menuItem && (
        <TrackMenu
          item={menuItem}
          playlists={playlists}
          onPlay={() => {
            if (menuItem.kind === 'video') setVideoId(menuItem.id);
            else playSongs(songs, menuItem.id);
            setMenuId(null);
          }}
          onEdit={() => {
            setEditingId(menuItem.id);
            setMenuId(null);
          }}
          onToggleFavorite={() => {
            toggleFavorite(menuItem.id);
            setMenuId(null);
          }}
          onRemove={() => {
            removeItem(menuItem.id);
            setMenuId(null);
          }}
          onClose={() => setMenuId(null)}
        />
      )}

      {library.preview && (
        <ScanPicker
          preview={library.preview}
          remaining={licence.itemLimit - items.length}
          onImport={(ids) => {
            void library.importSelection(ids).then((added) => {
              setToast(`${added} média(s) ajouté(s)`);
            });
          }}
          onCancel={library.cancelPreview}
        />
      )}

      {(licenceOpen || locked) && (
        <LicenceDialog licence={licence} locked={locked} onClose={() => setLicenceOpen(false)} />
      )}

      {accountOpen && (
        <AccountDialog
          api={accountApi}
          items={items}
          onRestore={library.mergeItems}
          onClose={() => setAccountOpen(false)}
        />
      )}

      {shareOpen && <ShareDialog api={accountApi} onClose={() => setShareOpen(false)} />}

      {downloadOpen && (
        <DownloadDialog library={library} onClose={() => setDownloadOpen(false)} />
      )}

      {editing && (
        <MetadataDialog
          item={editing}
          onSave={(patch) => {
            updateItem(editing.id, patch);
            setEditingId(null);
            setToast('Infos mises à jour');
          }}
          onRemove={() => {
            removeItem(editing.id);
            setEditingId(null);
          }}
          onClose={() => setEditingId(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <section className="empty">
      <h2>{label}</h2>
      <p>Ouvre les réglages pour scanner un dossier, ou change d'onglet.</p>
    </section>
  );
}
