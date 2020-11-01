import { useCallback, useMemo, useRef, useState } from 'react';

import { LoaderApi } from './loader-context';

export function useLoaderApi(): [LoaderApi, boolean] {
  const { current: loaders } = useRef(new Set<string>());
  const [isLoading, setIsLoading] = useState(false);

  const reevaluate = useCallback(() => {
    // setState hook does not trigger re-render
    // unless value differs
    setIsLoading(loaders.size > 0);
  }, [loaders]);

  const api = useMemo<LoaderApi>(
    () => ({
      isActive: (id: string) => loaders.has(id),
      update: (id: string, value: boolean) => {
        const res = value ? !!loaders.add(id) : loaders.delete(id);
        reevaluate();
        return res;
      },
      remove: (id: string) => {
        const res = loaders.delete(id);
        reevaluate();
        return res;
      },
    }),
    [loaders, reevaluate]
  );

  return [api, isLoading];
}
