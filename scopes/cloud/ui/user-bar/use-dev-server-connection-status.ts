import { useCallback, useEffect, useRef, useState } from 'react';

const CONNECTION_STATUS_EVENT = 'bit-dev-server-connection-status';
const ONLINE_POLL_MS = 10000;
const OFFLINE_POLL_MS = 2500;
const REQUEST_TIMEOUT_MS = 2500;
const RECOVERY_FADE_MS = 1500;
const PREVIEW_OFFLINE_DELAY_MS = 15000;

type ConnectionMode = 'online' | 'offline' | 'recovering';
type PreviewMode = 'online' | 'loading' | 'offline';
type ConnectionReason = 'network' | 'browser-offline' | 'preview';

type ConnectionEventDetail = {
  online?: boolean;
  reason?: ConnectionReason;
};

export function useDevServerConnectionStatus() {
  const [mode, setMode] = useState<ConnectionMode>('online');
  const [reason, setReason] = useState<ConnectionReason>('network');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('online');
  const modeRef = useRef<ConnectionMode>('online');
  const inFlightRef = useRef(false);
  const recoveryTimerRef = useRef<number | undefined>(undefined);
  const previewOfflineTimerRef = useRef<number | undefined>(undefined);

  const applyMode = useCallback((next: ConnectionMode) => {
    modeRef.current = next;
    setMode(next);
  }, []);

  const clearRecoveryTimer = useCallback(() => {
    if (!recoveryTimerRef.current) return;
    window.clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = undefined;
  }, []);

  const clearPreviewOfflineTimer = useCallback(() => {
    if (!previewOfflineTimerRef.current) return;
    window.clearTimeout(previewOfflineTimerRef.current);
    previewOfflineTimerRef.current = undefined;
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

  const markPreviewSignal = useCallback(
    (online: boolean) => {
      if (online) {
        clearPreviewOfflineTimer();
        setPreviewMode('online');
        return;
      }

      setPreviewMode((current) => (current === 'offline' ? current : 'loading'));
      clearPreviewOfflineTimer();
      previewOfflineTimerRef.current = window.setTimeout(() => {
        setPreviewMode('offline');
      }, PREVIEW_OFFLINE_DELAY_MS);
    },
    [clearPreviewOfflineTimer]
  );

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
      if (detail?.reason === 'preview') {
        markPreviewSignal(detail?.online === true);
        return;
      }
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
      clearPreviewOfflineTimer();
    };
  }, [clearRecoveryTimer, clearPreviewOfflineTimer, markOffline, markOnline, markPreviewSignal, runHealthCheck]);

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

  const isDevOffline = mode === 'offline';
  const isDevRecovering = mode === 'recovering';
  const showPreviewIndicator = mode === 'online' && previewMode !== 'online';
  const showIndicator = mode !== 'online' || showPreviewIndicator;

  const indicatorLabel = isDevOffline
    ? 'Offline'
    : isDevRecovering
      ? 'Online'
      : previewMode === 'offline'
        ? 'Previews offline'
        : 'Previews loading';

  const indicatorTone: 'offline' | 'recovering' | 'preview-loading' | 'preview-offline' = isDevOffline
    ? 'offline'
    : isDevRecovering
      ? 'recovering'
      : previewMode === 'offline'
        ? 'preview-offline'
        : 'preview-loading';

  const message = isDevOffline
    ? reason === 'browser-offline'
      ? 'Offline mode: browser has no network connection.'
      : 'Offline mode: waiting for dev server to respond.'
    : isDevRecovering
      ? 'Dev server is back online.'
      : previewMode === 'offline'
        ? 'Preview dev servers are offline. Main UI is still connected.'
        : 'Preview dev servers are still compiling.';

  return {
    mode,
    previewMode,
    showIndicator,
    isOffline: isDevOffline,
    indicatorLabel,
    indicatorTone,
    shouldFade: isDevRecovering,
    message,
    runHealthCheck,
  };
}
