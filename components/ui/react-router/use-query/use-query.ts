import { useLocation } from '@teambit/base-react.navigation.link';

/**
 * hook for using a query string.
 */
export function useQuery() {
  const { search } = useLocation() || { search: '/' };
  return new URLSearchParams(search);
}
