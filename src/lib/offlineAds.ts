import { ADS_CONTACT } from '../config';

/**
 * Sponsor banners stored on the device, so an advertiser is still shown when
 * Fox Media runs without any network. The owner fills the list from the wallet
 * screen when a sponsor pays; the house banner is the fallback.
 */
export interface OfflineAd {
  id: string;
  title: string;
  text: string;
  /** Data URL of the sponsor image, kept local: never fetched from the web. */
  image?: string;
  /** Opened only when a network is available. */
  url?: string;
  /** Last day the banner is shown, as a timestamp. */
  until?: number;
}

const KEY = 'fox-media:offline-ads';

export const HOUSE_AD: OfflineAd = {
  id: 'house',
  title: 'Ta pub ici',
  text: `Espace partenaire Fox Media — contact : ${ADS_CONTACT}`,
};

export function loadOfflineAds(): OfflineAd[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const ads = JSON.parse(raw) as OfflineAd[];
    const now = Date.now();
    return ads.filter((ad) => typeof ad.title === 'string' && (!ad.until || ad.until > now));
  } catch {
    return [];
  }
}

export function saveOfflineAds(ads: OfflineAd[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ads));
  } catch {
    // Storage full or private mode: the house banner takes over.
  }
}

/** Rotates through the paid banners, then falls back to the house banner. */
export function pickOfflineAd(index: number): OfflineAd {
  const ads = loadOfflineAds();
  if (ads.length === 0) return HOUSE_AD;
  return ads[index % ads.length];
}
