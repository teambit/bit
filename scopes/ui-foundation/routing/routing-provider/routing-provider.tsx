import React, { createContext, ReactNode, useContext, ComponentType } from 'react';
import { NativeLink, LinkProps } from '@teambit/ui.routing.native-link';
import { NativeNavLink, NavLinkProps } from '@teambit/ui.routing.native-nav-link';
import { isBrowser } from '@teambit/ui.is-browser';

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

// this is just a fallback,
// will only be used if run outside of react-router and the browser
const defaultLocation = { pathname: '/', search: '', hash: '' };

const defaultRouting: Routing = {
  Link: NativeLink,
  NavLink: NativeNavLink,
  useLocation: () => (isBrowser ? window.location : defaultLocation),
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
