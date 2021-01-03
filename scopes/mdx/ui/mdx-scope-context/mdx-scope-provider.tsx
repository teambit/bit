import React, { ReactNode } from 'react';
import { Components, MDXScopeContext } from './mdx-scope-context';

export type MDXScopeProviderProps = {
  /**
   * map of components to be available in the scope.
   */
  components: Components;

  /**
   * component children.
   */
  children: ReactNode;
};

export function MDXScopeProvider({ components, children }: MDXScopeProviderProps) {
  return <MDXScopeContext.Provider value={components}>{children}</MDXScopeContext.Provider>;
}
