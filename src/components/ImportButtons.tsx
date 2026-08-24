import { useRef } from 'react';
import { isDesktop } from '../lib/native';

interface Props {
  onFiles: (files: File[]) => void;
  onNative: (mode: 'folder' | 'files') => void;
  onLink?: () => void;
  scanning: boolean;
  compact?: boolean;
}

/** Desktop uses the native picker (real paths); the web build falls back to file inputs. */
export function ImportButtons({ onFiles, onNative, onLink, scanning, compact = false }: Props) {
  const native = isDesktop();
  const folderInput = useRef<HTMLInputElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    if (picked.length > 0) onFiles(picked);
    event.target.value = '';
  };

  return (
    <div className={compact ? 'import-buttons compact' : 'import-buttons'}>
      <button
        type="button"
        className="button primary"
        disabled={scanning}
        onClick={() => (native ? onNative('folder') : folderInput.current?.click())}
      >
        {scanning ? 'Analyse…' : 'Scanner un dossier'}
      </button>
      <button
        type="button"
        className="button"
        disabled={scanning}
        onClick={() => (native ? onNative('files') : fileInput.current?.click())}
      >
        Choisir des fichiers
      </button>
      {onLink && (
        <button type="button" className="button" onClick={onLink}>
          Coller un lien
        </button>
      )}
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        onChange={handleChange}
        {...{ webkitdirectory: '', directory: '' }}
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept="video/*,audio/*,.mp4,.mp3,.mkv,.m4a,.flac,.wav"
        onChange={handleChange}
      />
    </div>
  );
}
