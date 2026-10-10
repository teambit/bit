import type { ReactNode } from 'react';
import React, { createContext, useContext, useMemo } from 'react';

export type ComponentCompareIdentity = {
  name: string;
  /** compare-side id without version — the stable identity of the component being compared */
  componentId: string;
  baseId?: string;
  compareId: string;
};

const ComponentIdentityContext = createContext<ComponentCompareIdentity | undefined>(undefined);

/**
 * Which component the surrounding compare panel is showing.
 *
 * Available to anything rendered inside a panel, including its header — which is what lets a host
 * drop a control into the header without lane-compare having to hand the identity down to it.
 */
export function useComponentCompareIdentity(): ComponentCompareIdentity | undefined {
  return useContext(ComponentIdentityContext);
}

export function ComponentIdentityProvider({
  name,
  componentId,
  baseId,
  compareId,
  children,
}: ComponentCompareIdentity & { children: ReactNode }) {
  const value = useMemo(() => ({ name, componentId, baseId, compareId }), [name, componentId, baseId, compareId]);
  return <ComponentIdentityContext.Provider value={value}>{children}</ComponentIdentityContext.Provider>;
}
