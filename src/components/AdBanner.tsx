import { useEffect, useRef, useState } from 'react';
import { ADS_CLIENT, ADS_SCRIPT, ADS_SLOT } from '../config';
import { pickOfflineAd } from '../lib/offlineAds';

/** Ads sold by an ad network only work with a connection. */
const hasNetworkAds = Boolean(ADS_SCRIPT || (ADS_CLIENT && ADS_SLOT));

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/** Banner stored on the device, shown with or without a connection. */
function OfflineBanner({ online }: { online: boolean }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setIndex((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const ad = pickOfflineAd(index);
  const clickable = online && Boolean(ad.url);

  const body = (
    <>
      {ad.image && <img className="ad-image" src={ad.image} alt="" />}
      <span className="ad-text">
        <strong>{ad.title}</strong>
        <span>{ad.text}</span>
      </span>
    </>
  );

  return (
    <aside className="ad-banner house" aria-label="Espace publicitaire">
      {clickable ? (
        <a href={ad.url} target="_blank" rel="noreferrer noopener">
          {body}
        </a>
      ) : (
        body
      )}
    </aside>
  );
}

/**
 * Ad slot of the free app. With a connection and an ad network configured it
 * serves real ads; without a connection it falls back to the sponsor banners
 * stored on the device, so the app never waits for the network.
 */
export function AdBanner() {
  const online = useOnline();
  const loaded = useRef(false);
  const custom = useRef<HTMLElement | null>(null);
  const serveNetworkAds = hasNetworkAds && online;

  useEffect(() => {
    const host = custom.current;
    if (!ADS_SCRIPT || !serveNetworkAds || !host || host.childElementCount > 0) return;
    const script = document.createElement('script');
    script.src = ADS_SCRIPT;
    script.async = true;
    host.append(script);
  }, [serveNetworkAds]);

  useEffect(() => {
    if (!ADS_CLIENT || !ADS_SLOT || !serveNetworkAds || loaded.current) return;
    loaded.current = true;

    const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS_CLIENT}`;
    if (!document.querySelector(`script[src="${src}"]`)) {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      document.head.append(script);
    }

    const queue = (window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle ?? [];
    (window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle = queue;
    queue.push({});
  }, [serveNetworkAds]);

  if (!serveNetworkAds) return <OfflineBanner online={online} />;

  if (ADS_SCRIPT) {
    return <aside className="ad-banner" aria-label="Publicité" ref={custom} />;
  }

  return (
    <aside className="ad-banner" aria-label="Publicité">
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', height: 90 }}
        data-ad-client={ADS_CLIENT}
        data-ad-slot={ADS_SLOT}
        data-ad-format="horizontal"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
