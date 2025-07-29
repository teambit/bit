import React, { ReactNode } from 'react';

import { ScopeModel } from '@teambit/scope.models.scope-model';
import { ScopeContext } from './scope-context';

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
