import React, { ReactNode, useState } from 'react';
import { TreeContext } from './tree-context';

export type TreeProviderProps = {
  /**
   * children to be rendered within provider.
   */
  children: ReactNode;
};

export function TreeProvider({ children }: TreeProviderProps) {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true);
  const [activePath, setActivePath] = useState<string | undefined>(undefined);
  return (
    <TreeContext.Provider value={{ isCollapsed, setIsCollapsed, activePath, setActivePath }}>
      {children}
    </TreeContext.Provider>
  );
}
