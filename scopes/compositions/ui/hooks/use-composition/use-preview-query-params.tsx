import { useCallback } from 'react';
import { usePreview } from './use-composition';

export function usePreviewQueryParams<T = any>(paramName: string) {
  const ctx = usePreview();
  const param = ctx.queryParams[paramName];

  const setQueryParam = useCallback(
    (value: T) =>
      ctx.setQueryParams((state) => ({
        ...state,
        [paramName]: value,
      })),
    [paramName]
  );

  return [param as T, setQueryParam];
}
