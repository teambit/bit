import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

/**
 * `useLayoutEffect` warns when it runs on the server, where it cannot do anything useful anyway.
 * On the client it runs before the browser paints, which is the whole point here.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * A boolean UI preference that survives reloads.
 *
 * Reads storage in an effect rather than during render, on purpose. Initialising `useState` from
 * `localStorage` makes the first client render disagree with the server's, which React 18 treats as
 * a hydration failure. Rendering the default and correcting it on the first commit keeps both
 * renders identical.
 *
 * The correction happens in a *layout* effect, so it lands before the browser paints and the reader
 * never sees a frame of the default. Callers still get `hydrated` — the value is only trustworthy
 * after that first commit, and a transition keyed off it would otherwise animate from a state that
 * was never really on screen.
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

  useIsomorphicLayoutEffect(() => {
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
