import React, { ReactNode, useMemo } from 'react';
import { TreeContext } from './tree-context';
import type { TreeContextType } from './tree-context';

export type TreeProviderProps = {
  /**
   * children to be rendered within provider.
   */
  children: ReactNode;
} & TreeContextType;

export function TreeProvider({ children, activePath, setActivePath, isCollapsed, setIsCollapsed }: TreeProviderProps) {
  const value = useMemo(
    () => ({
      activePath,
      setActivePath,
      isCollapsed,
      setIsCollapsed,
    }),
    [activePath, setActivePath, isCollapsed, setIsCollapsed]
  );
  return <TreeContext.Provider value={value}>{children}</TreeContext.Provider>;
}
