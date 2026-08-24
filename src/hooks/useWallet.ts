import { useCallback, useEffect, useMemo, useState } from 'react';

const KEY = 'fox-wallet-sales';
const PAYOUT_KEY = 'fox-wallet-payouts';

export interface AdSale {
  id: string;
  advertiser: string;
  email: string;
  months: number;
  amount: number;
  startedAt: number;
  paid: boolean;
  /** `ads` is a banner sold, `noads` a user paying to remove the ads. */
  kind?: 'ads' | 'noads';
}

export type PayoutMethod = 'paypal' | 'carte' | 'virement';

export interface Payout {
  id: string;
  amount: number;
  method: PayoutMethod;
  at: number;
  note: string;
}

export interface Wallet {
  sales: AdSale[];
  payouts: Payout[];
  /** Money already received. */
  paidTotal: number;
  /** Money promised but not received yet. */
  pendingTotal: number;
  /** Money already withdrawn to the card or PayPal account. */
  payoutTotal: number;
  /** What is left to withdraw. */
  balance: number;
  /** Sales whose display period is still running. */
  activeCount: number;
  add: (sale: Omit<AdSale, 'id'>) => void;
  togglePaid: (id: string) => void;
  remove: (id: string) => void;
  withdraw: (amount: number, method: PayoutMethod, note: string) => void;
  removePayout: (id: string) => void;
}

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * MoneyFox: the owner-only ledger of what Fox Media earns (banners sold and
 * ad-free plans) and of every withdrawal. Everything stays on this device, so
 * it also works with no network at all.
 */
export function useWallet(): Wallet {
  const [sales, setSales] = useState<AdSale[]>(() => load<AdSale>(KEY));
  const [payouts, setPayouts] = useState<Payout[]>(() => load<Payout>(PAYOUT_KEY));

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(sales));
  }, [sales]);

  useEffect(() => {
    localStorage.setItem(PAYOUT_KEY, JSON.stringify(payouts));
  }, [payouts]);

  const totals = useMemo(() => {
    let paidTotal = 0;
    let pendingTotal = 0;
    let activeCount = 0;
    const now = Date.now();
    for (const sale of sales) {
      if (sale.paid) paidTotal += sale.amount;
      else pendingTotal += sale.amount;
      if (sale.months > 0 && sale.startedAt + sale.months * 30 * 24 * 3600 * 1000 > now) {
        activeCount += 1;
      }
    }
    const payoutTotal = payouts.reduce((sum, payout) => sum + payout.amount, 0);
    return { paidTotal, pendingTotal, activeCount, payoutTotal, balance: paidTotal - payoutTotal };
  }, [sales, payouts]);

  const add = useCallback((sale: Omit<AdSale, 'id'>) => {
    setSales((current) => [{ ...sale, id: crypto.randomUUID() }, ...current]);
  }, []);

  const togglePaid = useCallback((id: string) => {
    setSales((current) =>
      current.map((sale) => (sale.id === id ? { ...sale, paid: !sale.paid } : sale)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setSales((current) => current.filter((sale) => sale.id !== id));
  }, []);

  /** A withdrawal never goes past the balance: you cannot take out money you did not earn. */
  const withdraw = useCallback(
    (amount: number, method: PayoutMethod, note: string) => {
      if (!(amount > 0) || amount > totals.balance) return;
      setPayouts((current) => [
        { id: crypto.randomUUID(), amount, method, note, at: Date.now() },
        ...current,
      ]);
    },
    [totals.balance],
  );

  const removePayout = useCallback((id: string) => {
    setPayouts((current) => current.filter((payout) => payout.id !== id));
  }, []);

  return { sales, payouts, ...totals, add, togglePaid, remove, withdraw, removePayout };
}
