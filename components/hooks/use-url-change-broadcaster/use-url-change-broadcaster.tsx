import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export const URL_CHANGE_EVENT = 'WORKSPACE_URL_CHANGE';

export type UrlChangeBroadcasterOptions = {
  /** destination origin for postMessage (default: '*') */
  targetOrigin?: string;
  /** debounce time in ms */
  debounceMs?: number;
  /**
   * function to transform or enrich the payload
   * before it’s sent via postMessage.
   */
  enrichPayload?: (payload: UrlChangePayload) => Record<string, unknown>;
};

export type UrlChangePayload = {
  href: string;
  pathname: string;
  search: string;
  hash: string;
  timestamp: number;
};

/**
 * Hook that broadcasts URL changes via postMessage to window.parent.
 * Mount it only when you want it active.
 */
export function useUrlChangeBroadcaster({
  targetOrigin = '*',
  debounceMs = 0,
  enrichPayload,
}: UrlChangeBroadcasterOptions = {}) {
  const location = useLocation();

  const prevRef = useRef({
    key: (location as any).key,
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
  });

  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const changed =
      prevRef.current.key !== (location as any).key ||
      prevRef.current.pathname !== location.pathname ||
      prevRef.current.search !== location.search ||
      prevRef.current.hash !== location.hash;

    if (!changed) return;

    const post = () => {
      const base: UrlChangePayload = {
        href: window.location.href,
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
        timestamp: Date.now(),
      };

      const payload = enrichPayload ? enrichPayload(base) : base;

      try {
        window.parent?.postMessage({ event: URL_CHANGE_EVENT, payload }, targetOrigin);
      } finally {
        prevRef.current = {
          key: (location as any).key,
          pathname: location.pathname,
          search: location.search,
          hash: location.hash,
        };
      }
    };

    if (debounceMs > 0) {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(post, debounceMs);
      return () => {
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      };
    }

    post();
  }, [
    (location as any).key,
    location.pathname,
    location.search,
    location.hash,
    targetOrigin,
    debounceMs,
    enrichPayload,
  ]);
}
