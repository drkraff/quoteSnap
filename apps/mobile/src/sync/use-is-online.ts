import { useEffect, useState } from 'react';
import { isOnline, onConnectivityChange } from './network-monitor';

/** Live NetInfo flag — Quotes rows switch Queued ↔ Processing from this. */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(isOnline);

  useEffect(() => onConnectivityChange(setOnline), []);

  return online;
}
