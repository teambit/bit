import { useCallback, useEffect, useRef, useState } from 'react';

const CONNECTION_STATUS_EVENT = 'bit-dev-server-connection-status';
const ONLINE_POLL_MS = 10000;
const OFFLINE_POLL_MS = 2500;
const REQUEST_TIMEOUT_MS = 2500;
const RECOVERY_FADE_MS = 1500;
const PREVIEW_OFFLINE_DELAY_MS = 15000;
const OFFLINE_DEBOUNCE_MS = 1200;
const OFFLINE_GUARD_AFTER_RECOVERY_MS = 3000;

type ConnectionMode = 'online' | 'offline' | 'recovering';
type PreviewMode = 'online' | 'loading' | 'offline';
type ConnectionReason = 'network' | 'browser-offline' | 'preview';

type ConnectionEventDetail = {
  online?: boolean;
  reason?: ConnectionReason;
  previewKey?: string;
  previewPresenceDelta?: number;
};

export function useDevServerConnectionStatus() {
  const [mode, setMode] = useState<ConnectionMode>('online');
  const [reason, setReason] = useState<ConnectionReason>('network');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('online');
  const modeRef = useRef<ConnectionMode>('online');
  const inFlightRef = useRef(false);
  const recoveryTimerRef = useRef<number | undefined>(undefined);
  const previewOfflineTimerRef = useRef<number | undefined>(undefined);
  const offlineTimerRef = useRef<number | undefined>(undefined);
  const pendingOfflineReasonRef = useRef<ConnectionReason>('network');
  const ignoreOfflineUntilRef = useRef(0);
  const mainFailureCountRef = useRef(0);
  const previewPresenceKeysRef = useRef(new Set<string>());
  const previewReadyKeysRef = useRef(new Set<string>());
  const previewWentOnlineOnceRef = useRef(false);

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

  const clearOfflineTimer = useCallback(() => {
    if (!offlineTimerRef.current) return;
    window.clearTimeout(offlineTimerRef.current);
    offlineTimerRef.current = undefined;
  }, []);

  const pingDevServer = useCallback(async () => {
    if (typeof window === 'undefined') return true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
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

      return !!result?.ok;
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  const applyOfflineNow = useCallback(
    (nextReason: ConnectionReason) => {
      clearRecoveryTimer();
      clearOfflineTimer();
      setReason(nextReason);
      applyMode('offline');
    },
    [applyMode, clearOfflineTimer, clearRecoveryTimer]
  );

  const markOnline = useCallback(() => {
    mainFailureCountRef.current = 0;
    clearOfflineTimer();
    if (modeRef.current === 'online' || modeRef.current === 'recovering') return;
    clearRecoveryTimer();
    ignoreOfflineUntilRef.current = Date.now() + OFFLINE_GUARD_AFTER_RECOVERY_MS;
    applyMode('recovering');
    recoveryTimerRef.current = window.setTimeout(() => {
      applyMode('online');
    }, RECOVERY_FADE_MS);
  }, [applyMode, clearOfflineTimer, clearRecoveryTimer]);

  const markOffline = useCallback(
    (nextReason: ConnectionReason, immediate = false) => {
      if (nextReason === 'browser-offline' || immediate) {
        applyOfflineNow(nextReason);
        return;
      }
      if (Date.now() < ignoreOfflineUntilRef.current) {
        return;
      }

      pendingOfflineReasonRef.current = nextReason;
      if (offlineTimerRef.current) return;

      // Ignore transient transport blips (startup websocket churn, subscription reconnects).
      // We only transition to offline if a debounced, direct local health check still fails.
      offlineTimerRef.current = window.setTimeout(async () => {
        offlineTimerRef.current = undefined;
        if (!window.navigator.onLine) {
          applyOfflineNow('browser-offline');
          return;
        }
        const ok = await pingDevServer();
        if (ok) {
          mainFailureCountRef.current = 0;
          markOnline();
          return;
        }
        mainFailureCountRef.current += 1;
        if (mainFailureCountRef.current < 2) return;
        applyOfflineNow(pendingOfflineReasonRef.current);
      }, OFFLINE_DEBOUNCE_MS);
    },
    [applyOfflineNow, markOnline, pingDevServer]
  );

  const evaluatePreviewMode = useCallback(() => {
    const presence = previewPresenceKeysRef.current;
    const ready = previewReadyKeysRef.current;

    if (presence.size === 0) {
      clearPreviewOfflineTimer();
      previewWentOnlineOnceRef.current = false;
      setPreviewMode('online');
      return;
    }

    let allReady = true;
    for (const previewKey of presence) {
      if (!ready.has(previewKey)) {
        allReady = false;
        break;
      }
    }

    if (allReady) {
      clearPreviewOfflineTimer();
      previewWentOnlineOnceRef.current = true;
      setPreviewMode('online');
      return;
    }

    setPreviewMode('loading');
    if (!previewWentOnlineOnceRef.current) {
      clearPreviewOfflineTimer();
      return;
    }
    if (previewOfflineTimerRef.current) return;

    previewOfflineTimerRef.current = window.setTimeout(() => {
      previewOfflineTimerRef.current = undefined;
      const currentPresence = previewPresenceKeysRef.current;
      const currentReady = previewReadyKeysRef.current;
      if (currentPresence.size === 0) {
        previewWentOnlineOnceRef.current = false;
        setPreviewMode('online');
        return;
      }
      for (const previewKey of currentPresence) {
        if (!currentReady.has(previewKey)) {
          setPreviewMode('offline');
          return;
        }
      }
      previewWentOnlineOnceRef.current = true;
      setPreviewMode('online');
    }, PREVIEW_OFFLINE_DELAY_MS);
  }, [clearPreviewOfflineTimer]);

  const markPreviewPresence = useCallback(
    (delta: number, previewKey?: string) => {
      if (!previewKey) return;
      if (delta > 0) {
        previewPresenceKeysRef.current.add(previewKey);
      } else if (delta < 0) {
        previewPresenceKeysRef.current.delete(previewKey);
        previewReadyKeysRef.current.delete(previewKey);
      }
      evaluatePreviewMode();
    },
    [evaluatePreviewMode]
  );

  const markPreviewSignal = useCallback(
    (online: boolean, previewKey?: string) => {
      if (previewKey) {
        // Signals can arrive before explicit presence registration. Treat signal as implicit presence.
        previewPresenceKeysRef.current.add(previewKey);
        if (online) {
          previewReadyKeysRef.current.add(previewKey);
        } else {
          previewReadyKeysRef.current.delete(previewKey);
        }
        evaluatePreviewMode();
        return;
      }

      // Backward-compatibility path for legacy/unkeyed preview events.
      if (online) {
        clearPreviewOfflineTimer();
        previewWentOnlineOnceRef.current = true;
        setPreviewMode('online');
        return;
      }

      setPreviewMode((current) => (current === 'offline' ? current : 'loading'));
      clearPreviewOfflineTimer();
      previewOfflineTimerRef.current = window.setTimeout(() => {
        setPreviewMode('offline');
      }, PREVIEW_OFFLINE_DELAY_MS);
    },
    [clearPreviewOfflineTimer, evaluatePreviewMode]
  );

  const runHealthCheck = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (inFlightRef.current) return;

    inFlightRef.current = true;

    try {
      clearOfflineTimer();
      if (!window.navigator.onLine) {
        applyOfflineNow('browser-offline');
        return;
      }

      const ok = await pingDevServer();
      if (!ok) {
        markOffline('network');
        return;
      }

      mainFailureCountRef.current = 0;
      markOnline();
    } finally {
      inFlightRef.current = false;
    }
  }, [applyOfflineNow, clearOfflineTimer, markOffline, markOnline, pingDevServer]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleStatusEvent = (event: Event) => {
      const { detail } = event as CustomEvent<ConnectionEventDetail>;
      if (detail?.reason === 'preview') {
        if (typeof detail.previewPresenceDelta === 'number') {
          markPreviewPresence(detail.previewPresenceDelta, detail.previewKey);
          return;
        }
        markPreviewSignal(detail?.online === true, detail?.previewKey);
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

    const onOffline = () => markOffline('browser-offline', true);
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
      clearOfflineTimer();
      clearRecoveryTimer();
      clearPreviewOfflineTimer();
    };
  }, [
    clearOfflineTimer,
    clearRecoveryTimer,
    clearPreviewOfflineTimer,
    markOffline,
    markOnline,
    markPreviewPresence,
    markPreviewSignal,
    runHealthCheck,
  ]);

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
  const showIndicator = true;

  const indicatorLabel = isDevOffline
    ? 'Offline'
    : isDevRecovering
      ? 'Reconnecting'
      : previewMode === 'offline'
        ? 'Previews offline'
        : previewMode === 'loading'
          ? 'Previews loading'
          : 'Online';

  const indicatorTone: 'offline' | 'recovering' | 'preview-loading' | 'preview-offline' | 'online' = isDevOffline
    ? 'offline'
    : isDevRecovering
      ? 'recovering'
      : previewMode === 'offline'
        ? 'preview-offline'
        : previewMode === 'loading'
          ? 'preview-loading'
          : 'online';

  const message = isDevOffline
    ? reason === 'browser-offline'
      ? 'Offline mode: browser has no network connection.'
      : 'Offline mode: waiting for dev server to respond.'
    : isDevRecovering
      ? 'Reconnecting and validating dev server health.'
      : previewMode === 'offline'
        ? 'Preview dev servers are offline. Main UI is still connected.'
        : showPreviewIndicator
          ? 'Preview dev servers are still compiling.'
          : 'Workspace UI and dev server are connected.';

  return {
    mode,
    previewMode,
    showIndicator,
    isOffline: isDevOffline,
    indicatorLabel,
    indicatorTone,
    shouldFade: false,
    message,
    runHealthCheck,
  };
}
