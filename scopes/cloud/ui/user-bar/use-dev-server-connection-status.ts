import { useCallback, useEffect, useRef, useState } from 'react';

const CONNECTION_STATUS_EVENT = 'bit-dev-server-connection-status';
const ONLINE_POLL_MS = 10000;
const OFFLINE_POLL_MS = 2500;
const REQUEST_TIMEOUT_MS = 2500;
const RECOVERY_FADE_MS = 1500;

type ConnectionMode = 'online' | 'offline' | 'recovering';
type ConnectionReason = 'network' | 'browser-offline' | 'preview';

type ConnectionEventDetail = {
  online?: boolean;
  reason?: ConnectionReason;
};

export function useDevServerConnectionStatus() {
  const [mode, setMode] = useState<ConnectionMode>('online');
  const [reason, setReason] = useState<ConnectionReason>('network');
  const modeRef = useRef<ConnectionMode>('online');
  const inFlightRef = useRef(false);
  const recoveryTimerRef = useRef<number | undefined>(undefined);

  const applyMode = useCallback((next: ConnectionMode) => {
    modeRef.current = next;
    setMode(next);
  }, []);

  const clearRecoveryTimer = useCallback(() => {
    if (!recoveryTimerRef.current) return;
    window.clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = undefined;
  }, []);

  const markOffline = useCallback(
    (nextReason: ConnectionReason) => {
      clearRecoveryTimer();
      setReason(nextReason);
      applyMode('offline');
    },
    [applyMode, clearRecoveryTimer]
  );

  const markOnline = useCallback(() => {
    if (modeRef.current === 'online') return;
    clearRecoveryTimer();
    applyMode('recovering');
    recoveryTimerRef.current = window.setTimeout(() => {
      applyMode('online');
    }, RECOVERY_FADE_MS);
  }, [applyMode, clearRecoveryTimer]);

  const runHealthCheck = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      if (!window.navigator.onLine) {
        markOffline('browser-offline');
        return;
      }

      const result = await fetch('/graphql', {
        method: 'POST',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: 'query __BitHealth { __typename }',
        }),
      }).catch(() => undefined);

      if (!result || !result.ok) {
        markOffline('network');
        return;
      }

      markOnline();
    } finally {
      window.clearTimeout(timeout);
      inFlightRef.current = false;
    }
  }, [markOffline, markOnline]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleStatusEvent = (event: Event) => {
      const { detail } = event as CustomEvent<ConnectionEventDetail>;
      if (detail?.online === true) {
        markOnline();
        return;
      }
      if (detail?.online === false) {
        markOffline(detail.reason || 'network');
      }
    };

    const onOffline = () => markOffline('browser-offline');
    const onOnline = () => {
      void runHealthCheck();
    };

    window.addEventListener(CONNECTION_STATUS_EVENT, handleStatusEvent as EventListener);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    return () => {
      window.removeEventListener(CONNECTION_STATUS_EVENT, handleStatusEvent as EventListener);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      clearRecoveryTimer();
    };
  }, [clearRecoveryTimer, markOffline, markOnline, runHealthCheck]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    void runHealthCheck();
    const interval = window.setInterval(
      () => {
        if (!document.hidden || modeRef.current !== 'online') {
          void runHealthCheck();
        }
      },
      modeRef.current === 'online' ? ONLINE_POLL_MS : OFFLINE_POLL_MS
    );

    return () => window.clearInterval(interval);
  }, [runHealthCheck, mode]);

  const message =
    reason === 'browser-offline'
      ? 'Offline mode: browser has no network connection.'
      : reason === 'preview'
        ? 'Offline mode: waiting for preview dev server to restart.'
        : 'Offline mode: waiting for dev server to respond.';

  return {
    mode,
    showIndicator: mode !== 'online',
    isOffline: mode === 'offline',
    message,
    runHealthCheck,
  };
}
