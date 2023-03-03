import { useQuery as defaultUseQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { useLocation as defaultUseLocation } from '@teambit/base-react.navigation.link';

export type ComponentCompareQueryParams = {
  baseVersion?: string;
  version?: string;
  file?: string;
  compositionBaseFile?: string;
  compositionCompareFile?: string;
  aspect?: string;
};

export function useUpdatedUrlFromQuery(
  queryParams: ComponentCompareQueryParams,
  useQuery: () => URLSearchParams = defaultUseQuery,
  useLocation: () => { pathname: string } | undefined = defaultUseLocation
): string {
  const query = useQuery();
  const location = useLocation() || { pathname: '/' };

  const queryObj = Object.fromEntries(query.entries());

  const updatedObj = { ...queryObj, ...queryParams };
  const queryString = new URLSearchParams(updatedObj).toString();

  return `${location.pathname}?${queryString}`;
}

export function useCompareQueryParam(key: keyof ComponentCompareQueryParams): string | undefined {
  const query = defaultUseQuery();
  const queryParam = query.get(key);
  return queryParam ?? undefined;
}
