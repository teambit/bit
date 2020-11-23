import { useLocation } from 'react-router-dom';

/**
 * hook for using a query string.
 */
export function useQuery() {
  return new URLSearchParams(useLocation().search);
}
