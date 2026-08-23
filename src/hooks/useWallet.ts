import { useCallback, useEffect, useMemo, useState } from 'react';

const KEY = 'fox-wallet-sales';

export interface AdSale {
  id: string;
  advertiser: string;
  email: string;
  months: number;
  amount: number;
  startedAt: number;
  paid: boolean;
}

export interface Wallet {
  sales: AdSale[];
  /** Money already received. */
  paidTotal: number;
  /** Money promised but not received yet. */
  pendingTotal: number;
  /** Sales whose display period is still running. */
  activeCount: number;
  add: (sale: Omit<AdSale, 'id'>) => void;
  togglePaid: (id: string) => void;
  remove: (id: string) => void;
}

function load(): AdSale[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AdSale[]) : [];
  } catch {
    return [];
  }
}

/** Owner-only ledger of the advertising spots sold, stored on this device. */
export function useWallet(): Wallet {
  const [sales, setSales] = useState<AdSale[]>(load);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(sales));
  }, [sales]);

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

  const totals = useMemo(() => {
    let paidTotal = 0;
    let pendingTotal = 0;
    let activeCount = 0;
    const now = Date.now();
    for (const sale of sales) {
      if (sale.paid) paidTotal += sale.amount;
      else pendingTotal += sale.amount;
      if (sale.startedAt + sale.months * 30 * 24 * 3600 * 1000 > now) activeCount += 1;
    }
    return { paidTotal, pendingTotal, activeCount };
  }, [sales]);

  return { sales, ...totals, add, togglePaid, remove };
}
