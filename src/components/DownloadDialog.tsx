import { useEffect, useRef, useState } from 'react';
import type { Library } from '../hooks/useLibrary';
import { nativeBridge } from '../lib/native';

interface Props {
  library: Library;
  onClose: () => void;
}

function fileNameOf(url: string): string {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
    return name || 'video.mp4';
  } catch {
    return 'video.mp4';
  }
}

/**
 * Paste a link, get the video in the library. On desktop the download runs in
 * the main process, which also handles pages such as a TikTok video; in the
 * browser only direct file links can be fetched, because of CORS.
 */
export function DownloadDialog({ library, onClose }: Props) {
  const [url, setUrl] = useState('');
  const [percent, setPercent] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const bridge = nativeBridge();

  useEffect(() => {
    input.current?.focus();
    void navigator.clipboard
      ?.readText()
      .then((text) => {
        if (/^https?:\/\//i.test(text.trim())) setUrl((current) => current || text.trim());
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => bridge?.onDownloadProgress?.((value) => setPercent(value)), [bridge]);

  const start = async () => {
    const link = url.trim();
    if (!/^https?:\/\//i.test(link)) {
      setError('Colle un lien qui commence par https://');
      return;
    }

    setError(null);
    setStatus('Téléchargement…');
    setPercent(0);
    try {
      if (bridge?.download) {
        const entry = await bridge.download(link);
        const added = await library.addNativeEntries([entry]);
        setStatus(added > 0 ? `${entry.name} est dans ta bibliothèque.` : 'Cette vidéo y était déjà.');
      } else {
        const response = await fetch(link);
        if (!response.ok) throw new Error(`Refusé (${response.status})`);
        const blob = await response.blob();
        const name = fileNameOf(link);
        const file = new File([blob], /\.[a-z0-9]{2,4}$/i.test(name) ? name : `${name}.mp4`, {
          type: blob.type || 'video/mp4',
        });
        const added = await library.addFiles([file]);
        setStatus(added > 0 ? `${file.name} est dans ta bibliothèque.` : 'Cette vidéo y était déjà.');
      }
      setUrl('');
      setPercent(100);
    } catch (cause) {
      setPercent(null);
      setStatus(null);
      setError(
        bridge
          ? `Échec : ${cause instanceof Error ? cause.message : 'lien illisible'}`
          : "Sur navigateur, seuls les liens de fichier direct (.mp4, .mp3…) marchent. L'appli PC accepte n'importe quel lien.",
      );
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal licence-modal">
        <h2>Télécharger depuis un lien</h2>
        <p className="licence-intro">
          Colle l&apos;adresse d&apos;une vidéo : Fox Media la télécharge sur ton appareil et
          l&apos;ajoute à ta bibliothèque. Ensuite, elle se regarde sans réseau.
        </p>

        <label className="field">
          <span>Lien de la vidéo</span>
          <input
            ref={input}
            value={url}
            placeholder="https://…"
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void start();
            }}
          />
        </label>

        {percent !== null && (
          <div className="download-progress" aria-live="polite">
            <div className="download-bar" style={{ width: `${percent}%` }} />
            <span>{percent}%</span>
          </div>
        )}

        {status && <p className="licence-status">{status}</p>}
        {error && <p className="licence-error">{error}</p>}

        <div className="licence-actions">
          <button
            type="button"
            className="button primary"
            disabled={percent !== null && percent < 100}
            onClick={() => void start()}
          >
            Télécharger
          </button>
          {bridge?.openDownloads && (
            <button type="button" className="button" onClick={() => void bridge.openDownloads?.()}>
              Ouvrir le dossier
            </button>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
