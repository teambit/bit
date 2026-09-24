import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

/**
 * `useLayoutEffect` warns when it runs on the server, where it cannot do anything useful anyway.
 * On the client it runs before the browser paints, which is the whole point here.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function read(storageKey: string, defaultValue: boolean): boolean {
  try {
    const stored = globalThis.localStorage?.getItem(storageKey);
    if (stored === 'true' || stored === 'false') return stored === 'true';
  } catch {
    // storage unavailable — fall through to the default
  }
  return defaultValue;
}

/**
 * A boolean UI preference that survives reloads.
 *
 * Reads storage in an effect rather than during render, on purpose. Initialising `useState` from
 * `localStorage` makes the first client render disagree with the server's, which React 18 treats as
 * a hydration failure. Rendering the default and correcting it on the first commit keeps both
 * renders identical.
 *
 * The correction happens in a *layout* effect, so it lands before the browser paints and the reader
 * never sees a frame of the default. `hydrated` reports when that has happened: the value is only
 * trustworthy afterwards, and a caller animating this preference has to hold its transition back
 * until then or it animates from a state that was never really on screen.
 *
 * Storage failures are non-fatal: a preference that cannot be persisted (private mode, disabled
 * storage, quota) degrades to an in-memory toggle rather than breaking the surface using it.
 */
export function usePersistedToggle(
  storageKey: string,
  defaultValue: boolean
): [value: boolean, setValue: (next: boolean) => void, hydrated: boolean] {
  const [value, setValue] = useState(defaultValue);
  // which key produced `value`. Without it, moving a mounted caller to a key that has nothing stored
  // would leave the previous key's preference on screen instead of falling back to the default.
  const [hydratedKey, setHydratedKey] = useState<string | undefined>(undefined);

  useIsomorphicLayoutEffect(() => {
    setValue(read(storageKey, defaultValue));
    setHydratedKey(storageKey);
  }, [storageKey, defaultValue]);

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

  return [value, update, hydratedKey === storageKey];
}
