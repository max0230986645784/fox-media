import { useEffect, useState } from 'react';

const KEY = 'fox-install-hidden';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function isApple() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Free install without any store: a one-tap button where the browser supports it
 * (Android, Chrome/Edge on desktop) and the Safari steps on iPhone/iPad.
 */
export function InstallPrompt() {
  const [hidden, setHidden] = useState(() => localStorage.getItem(KEY) === '1');
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [steps, setSteps] = useState(false);

  useEffect(() => {
    const onPrompt = (raw: Event) => {
      raw.preventDefault();
      setEvent(raw as InstallEvent);
    };
    const onInstalled = () => {
      setEvent(null);
      setHidden(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(KEY, '1');
    setHidden(true);
  };

  if (hidden || isStandalone()) return null;
  if (!event && !isApple()) return null;

  return (
    <>
      <p className="notice install-prompt">
        <b>Installe Fox Media</b> — gratuit, sans magasin d'applications.
        {event ? (
          <button
            type="button"
            className="link"
            onClick={() => {
              void event.prompt().then(() => setEvent(null));
            }}
          >
            Installer
          </button>
        ) : (
          <button type="button" className="link" onClick={() => setSteps(true)}>
            Comment faire
          </button>
        )}
        <button type="button" className="link subtle" onClick={dismiss}>
          Plus tard
        </button>
      </p>

      {steps && (
        <div className="sheet-backdrop" onClick={() => setSteps(false)}>
          <div className="install-sheet" onClick={(sheet) => sheet.stopPropagation()}>
            <h2>Installer sur iPhone / iPad</h2>
            <ol className="install-steps">
              <li>Ouvre cette page dans <b>Safari</b> (pas Chrome).</li>
              <li>
                Touche le bouton <b>Partager</b> en bas de l'écran (le carré avec une flèche vers le
                haut).
              </li>
              <li>
                Fais défiler et touche <b>Sur l'écran d'accueil</b>.
              </li>
              <li>
                Touche <b>Ajouter</b> : l'icône Fox Media apparaît avec tes autres applications.
              </li>
            </ol>
            <p className="hint">
              Tes vidéos et musiques restent sur ton appareil : rien n'est envoyé sur Internet.
            </p>
            <button type="button" className="primary" onClick={() => setSteps(false)}>
              J'ai compris
            </button>
          </div>
        </div>
      )}
    </>
  );
}
