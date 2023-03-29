import { useContext } from 'react';
import { RouterContext } from './router-context';

/**
 * Gets routing components from context.
 * (defaults to native components)
 */
export function useRouter() {
  const routerContext = useContext(RouterContext);
  return routerContext;
}
