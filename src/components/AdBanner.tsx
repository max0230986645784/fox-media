import { useEffect, useRef } from 'react';
import { ADS_CLIENT, ADS_CONTACT, ADS_SCRIPT, ADS_SLOT, PRICE_EUR } from '../config';

/**
 * Ad slot shown to users without a licence. With an AdSense publisher id it
 * serves real ads; without one it shows a house banner offering the space to
 * partners, so no third-party script ever loads unconfigured.
 */
export function AdBanner() {
  const loaded = useRef(false);
  const custom = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const host = custom.current;
    if (!ADS_SCRIPT || !host || host.childElementCount > 0) return;
    const script = document.createElement('script');
    script.src = ADS_SCRIPT;
    script.async = true;
    host.append(script);
  }, []);

  useEffect(() => {
    if (!ADS_CLIENT || !ADS_SLOT || loaded.current) return;
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
  }, []);

  if (ADS_SCRIPT) {
    return <aside className="ad-banner" aria-label="Publicité" ref={custom} />;
  }

  if (!ADS_CLIENT || !ADS_SLOT) {
    return (
      <aside className="ad-banner house" aria-label="Espace publicitaire">
        <strong>Ta pub ici</strong>
        <span>
          Espace partenaire Fox Media — contact&nbsp;: {ADS_CONTACT}. Version sans pub à{' '}
          {PRICE_EUR} €.
        </span>
      </aside>
    );
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
