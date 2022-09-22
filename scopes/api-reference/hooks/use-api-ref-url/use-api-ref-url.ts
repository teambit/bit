import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';

export type APIRefQueryParams = {
  selectedAPI?: string;
};

export function useAPIRefParam(key: keyof APIRefQueryParams): string | undefined {
  const query = useQuery();
  const queryParam = query.get(key);
  return queryParam ?? undefined;
}
