import React, { useContext, ReactNode } from 'react';
import { LinkType, UseLocation } from './link.type';

export type RouterContextType = {
  /**
   * link implementation.
   */
  Link?: LinkType;

  /**
   * useLocation implementation.
   */
  useLocation?: UseLocation;
};

export const RouterContext = React.createContext<RouterContextType>({});

/**
 * Gets routing components from context.
 * (defaults to native components)
 */
export function useRouter() {
  const routerContext = useContext(RouterContext);
  return routerContext;
}

export function RouterProvider({
  children,
  implementation,
}: {
  children: ReactNode;
  implementation: RouterContextType;
}) {
  return <RouterContext.Provider value={implementation}>{children}</RouterContext.Provider>;
}
