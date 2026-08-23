import { useState } from 'react';

const KEY = 'fox-ios-install-hidden';

function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return ios && !standalone;
}

/** Tells iPhone/iPad users how to install Fox Media for free from Safari. */
export function IosInstall() {
  const [hidden, setHidden] = useState(() => localStorage.getItem(KEY) === '1');
  if (hidden || !isIosSafari()) return null;

  return (
    <p className="notice ios-install">
      Installe Fox Media gratuitement : <b>Partager</b> puis <b>Sur l'écran d'accueil</b>.
      <button
        type="button"
        className="link"
        onClick={() => {
          localStorage.setItem(KEY, '1');
          setHidden(true);
        }}
      >
        Fermer
      </button>
    </p>
  );
}
