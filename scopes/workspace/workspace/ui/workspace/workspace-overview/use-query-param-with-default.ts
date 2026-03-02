import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const STORAGE_KEY_PREFIX = 'workspace-overview:';

export interface QueryParamOptions {
  /** persist value to localStorage across sessions. Default: true */
  persist?: boolean;
}

export function useQueryParamWithDefault<T extends string>(
  paramName: string,
  fallback: T,
  options: QueryParamOptions = {}
): [T, (value: T | null) => void] {
  const { persist = true } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const storageKey = STORAGE_KEY_PREFIX + paramName;

  const value = useMemo((): T => {
    const urlValue = searchParams.get(paramName);
    if (urlValue) return urlValue as T;

    if (persist) {
      const stored = safeGetItem(storageKey);
      if (stored) return stored as T;
    }

    return fallback;
  }, [searchParams, paramName, storageKey, fallback, persist]);

  const setValue = useCallback(
    (newValue: T | null) => {
      const newParams = new URLSearchParams(searchParams);

      if (newValue === null) {
        newParams.delete(paramName);
        if (persist) safeRemoveItem(storageKey);
      } else {
        newParams.set(paramName, newValue);
        if (persist) safeSetItem(storageKey, newValue);
      }

      setSearchParams(newParams);
    },
    [searchParams, setSearchParams, paramName, storageKey, persist]
  );

  return [value, setValue];
}

export function useListParamWithDefault(
  paramName: string,
  options: QueryParamOptions = {}
): [string[], (values: string[]) => void] {
  const { persist = false } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const storageKey = STORAGE_KEY_PREFIX + paramName;

  const values = useMemo((): string[] => {
    const urlValue = searchParams.get(paramName);
    if (urlValue) return urlValue.split(',').filter(Boolean);

    if (persist) {
      const stored = safeGetItem(storageKey);
      if (stored) return stored.split(',').filter(Boolean);
    }

    return [];
  }, [searchParams, paramName, storageKey, persist]);

  const setValues = useCallback(
    (newValues: string[]) => {
      const newParams = new URLSearchParams(searchParams);
      const joined = newValues.filter(Boolean).join(',');

      if (joined) {
        newParams.set(paramName, joined);
        if (persist) safeSetItem(storageKey, joined);
      } else {
        newParams.delete(paramName);
        if (persist) safeRemoveItem(storageKey);
      }

      setSearchParams(newParams);
    },
    [searchParams, setSearchParams, paramName, storageKey, persist]
  );

  return [values, setValues];
}

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
}
