import React, { ReactNode } from 'react';
import { TreeContext } from './tree-context';
import type { TreeContextType } from './tree-context';

export type TreeProviderProps = {
  /**
   * children to be rendered within provider.
   */
  children: ReactNode;
} & TreeContextType;

export function TreeProvider({ children, activePath, setActivePath, isCollapsed, setIsCollapsed }: TreeProviderProps) {
  return (
    <TreeContext.Provider value={{ isCollapsed, setIsCollapsed, activePath, setActivePath }}>
      {children}
    </TreeContext.Provider>
  );
}
