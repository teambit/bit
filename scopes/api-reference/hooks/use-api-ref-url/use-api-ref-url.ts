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
  const location = useLocation() || { pathname: '/' };
  return `${location.pathname}${queryParams.selectedAPI ? `?selectedAPI=${queryParams.selectedAPI}` : ''}`;
}
