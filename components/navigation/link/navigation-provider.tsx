import React, { useContext, ReactNode } from 'react';
import { LinkType, UseLocation, UseNavigate } from './link.type';

export type RouterContextType = {
  /**
   * link implementation.
   */
  Link?: LinkType;

  /**
   * useLocation implementation.
   */
  useLocation?: UseLocation;

  /**
   * navigate to another page
   */
  useNavigate?: UseNavigate;
};

export const NavigationContext = React.createContext<RouterContextType>({});

/**
 * Gets routing components from context.
 * (defaults to native components)
 */
export function useNavigation() {
  const routerContext = useContext(NavigationContext);
  return routerContext;
}

export function NavigationProvider({
  children,
  implementation,
}: {
  children: ReactNode;
  implementation: RouterContextType;
}) {
  return <NavigationContext.Provider value={implementation}>{children}</NavigationContext.Provider>;
}
