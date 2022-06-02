import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { useLocation } from '@teambit/base-ui.routing.routing-provider';

export type ComponentCompareQueryParams = {
  baseVersion?: string;
  version?: string;
  file?: string;
  compositionBaseFile?: string;
  compositionCompareFile?: string;
  aspect?: string;
};

export function useUpdatedUrlFromQuery(queryParams: ComponentCompareQueryParams): string {
  const query = useQuery();
  const location = useLocation();
  const updatedObj = {};

  for (const [key, value] of query.entries()) {
    updatedObj[key] = queryParams[key] || value;
  }

  for (const key of Object.keys(queryParams)) {
    updatedObj[key] = queryParams[key];
  }

  const queryString = new URLSearchParams(updatedObj).toString();

  return `${location.pathname}?${queryString}`;
}

export function useCompareQueryParam(key: keyof ComponentCompareQueryParams): string | undefined {
  const query = useQuery();
  const queryParam = query.get(key);
  return queryParam ?? undefined;
}
