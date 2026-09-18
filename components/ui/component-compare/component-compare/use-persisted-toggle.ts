import { useCallback, useEffect, useState } from 'react';

/**
 * A boolean UI preference that survives reloads.
 *
 * Reads storage in an effect rather than during render, on purpose. Initialising state from
 * `localStorage` makes the first client render disagree with the server's, which React 18 treats as
 * a hydration failure — so the stored value is applied on the first commit instead. The trade-off is
 * one render with the default value, which is why callers get `hydrated` and can suppress a
 * transition until the real preference is known.
 *
 * Storage failures are non-fatal: a preference that cannot be persisted (private mode, disabled
 * storage, quota) degrades to an in-memory toggle rather than breaking the surface using it.
 */
export function usePersistedToggle(
  storageKey: string,
  defaultValue: boolean
): [value: boolean, setValue: (next: boolean) => void, hydrated: boolean] {
  const [value, setValue] = useState(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = globalThis.localStorage?.getItem(storageKey);
      if (stored === 'true' || stored === 'false') setValue(stored === 'true');
    } catch {
      // storage unavailable — keep the default
    }
    setHydrated(true);
  }, [storageKey]);

  const update = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        globalThis.localStorage?.setItem(storageKey, String(next));
      } catch {
        // the toggle still works for this session even if it cannot be remembered
      }
    },
    [storageKey]
  );

  return [value, update, hydrated];
}
