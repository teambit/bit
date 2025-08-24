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
  const queryObj = Object.fromEntries(query.entries());

  const updatedObj = { ...queryObj, ...queryParams };
  const queryString = new URLSearchParams(updatedObj).toString();
  const isOnAPIRefSubroute = location.pathname.includes('~api-reference');
  const apiRefSubRoute = isOnAPIRefSubroute ? '' : '/~api-reference';
  return `${location.pathname}${apiRefSubRoute}?${queryString}`;
}
