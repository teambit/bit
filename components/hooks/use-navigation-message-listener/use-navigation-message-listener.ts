import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const WORKSPACE_NAVIGATE = 'WORKSPACE_NAVIGATE';

export type NavigationMessageListenerProps = {
  origin?: string;
};

export function useNavigationMessageListener({ origin = '*' }: NavigationMessageListenerProps = {}) {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (event: MessageEvent) => {
      if (origin !== '*' && event.origin !== origin) return;

      const data = event.data;
      if (!data || data.event !== WORKSPACE_NAVIGATE) return;

      const payload = data.payload ?? {};
      const path = String(payload.path ?? '').trim();
      if (!path) return;

      // Reject absolute URLs; only allow app-internal relative paths
      if (isAbsoluteUrl(path)) return;

      const finalPath = path.startsWith('/') ? path : `/${path}`;

      try {
        navigate(finalPath, {
          replace: !!payload.replace,
          state: payload.state,
        });
      } catch {
        // swallow bad inputs
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [navigate, origin]);
}

function isAbsoluteUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}
