import { useCallback, useEffect, useState } from 'react';
import type { Account, ServerStats } from '../lib/account';
import { currentAccount, serverStats, signIn, signOut, signUp } from '../lib/account';

export interface AccountApi {
  ready: boolean;
  account: Account | null;
  stats: ServerStats | null;
  /** Days left before the referral programme closes; null when unknown. */
  referralDaysLeft: number | null;
  register: (
    email: string,
    password: string,
    referral: string,
    name: string,
  ) => Promise<Account>;
  login: (email: string, password: string) => Promise<Account>;
  logout: () => void;
}

function daysLeft(endsAt: string | undefined): number | null {
  if (!endsAt) return null;
  const end = Date.parse(endsAt);
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}

export function useAccount(): AccountApi {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [stats, setStats] = useState<ServerStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([currentAccount(), serverStats()])
      .then(([loaded, loadedStats]) => {
        if (cancelled) return;
        setAccount(loaded);
        setStats(loadedStats);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const register = useCallback(async (
    email: string,
    password: string,
    referral: string,
    name: string,
  ) => {
    const created = await signUp(email, password, referral, name);
    setAccount(created);
    setStats(await serverStats());
    return created;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const loaded = await signIn(email, password);
    setAccount(loaded);
    return loaded;
  }, []);

  const logout = useCallback(() => {
    signOut();
    setAccount(null);
  }, []);

  return {
    ready,
    account,
    stats,
    referralDaysLeft: stats?.referralOpen ? daysLeft(stats.referralEndsAt) : 0,
    register,
    login,
    logout,
  };
}
