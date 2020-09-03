import React, { ReactNode } from 'react';

import { ScopeContext } from './scope-context';
import { ScopeModel } from './scope-model';

export type ScopeProviderProps = {
  /**
   * scope model.
   */
  scope: ScopeModel;

  /**
   * react children.
   */
  children: ReactNode;
};

/**
 * context provider of the scope
 */
export function ScopeProvider({ scope, children }: ScopeProviderProps) {
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>;
}
