import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { useLocation } from '@teambit/base-react.navigation.link';
import lodash from 'lodash';

export type ComponentCompareQueryParams = {
  baseVersion?: string | null;
  version?: string | null;
  file?: string | null;
  compositionBaseFile?: string | null;
  compositionCompareFile?: string | null;
  aspect?: string | null;
};

export function useUpdatedUrlFromQuery(queryParams: ComponentCompareQueryParams): string {
  const query = useQuery();
  const location = useLocation() || { pathname: '/' };

  const queryObj = Object.fromEntries(query.entries());

  const updatedObj = lodash.omitBy({ ...queryObj, ...queryParams }, (k) => k === null) as Record<string, string>;
  const queryString = new URLSearchParams(updatedObj).toString();

  return `${location.pathname}?${queryString}`;
}

export function useCompareQueryParam(key: keyof ComponentCompareQueryParams): string | undefined {
  const query = useQuery();
  const queryParam = query.get(key);
  return queryParam ?? undefined;
}
