import React, { createContext, ReactNode, useContext, ComponentType } from 'react';
import { NativeLink, LinkProps } from '@teambit/ui.routing.native-link';
import { NativeNavLink, NavLinkProps } from '@teambit/ui.routing.native-nav-link';

export type Location<State = any> = {
  pathname: string;
  search: string;
  state?: State;
  hash: string;
  key?: string;
};

export interface Routing {
  Link: ComponentType<LinkProps>;
  NavLink: ComponentType<NavLinkProps>;
  useLocation: <State>() => Location<State>;
}

const defaultRouting: Routing = {
  Link: NativeLink,
  NavLink: NativeNavLink,
  useLocation: () => window.location,
};

const RoutingContext = createContext<Routing>(defaultRouting);

/**
 * Injects routing components into context
 */
export function RoutingProvider({ value, children }: { value: Routing; children: ReactNode }) {
  return <RoutingContext.Provider value={value}>{children}</RoutingContext.Provider>;
}

/**
 * Gets routing components from context.
 * (defaults to native components)
 */
export function useRouting() {
  return useContext(RoutingContext);
}

/**
 * equivalent to window.location
 */
export function useLocation() {
  return useRouting().useLocation();
}
