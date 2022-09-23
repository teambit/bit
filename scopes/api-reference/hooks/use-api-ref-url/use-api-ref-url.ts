import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { useLocation } from '@teambit/base-react.navigation.link';

export type APIRefQueryParams = {
  selectedAPI?: string;
};

export function useAPIRefParam(key: keyof APIRefQueryParams): string | undefined {
  const query = useQuery();
  const queryParam = query.get(key);
  return queryParam ?? undefined;
}

export function useUpdatedUrlFromQuery(queryParams: APIRefQueryParams): string {
  const query = useQuery();
  const location = useLocation() || { pathname: '/' };

  // @ts-ignore
  const queryObj = Object.fromEntries(query.entries());

  const updatedObj = { ...queryObj, ...queryParams };
  const queryString = new URLSearchParams(updatedObj).toString();

  return `${location.pathname}?${queryString}`;
}
