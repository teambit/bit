import { createContext } from 'react';

export type TreeContextType = {
  /**
   * indicates all collapsing nodes across the tree should open / close
   */
  isCollapsed?: boolean;
  /**
   * open / close all collapsing nodes in the tree
   */
  setIsCollapsed?: (x?: boolean) => void;
  /**
   * active path - indicates the path to the currently active node
   */
  activePath?: string;
  /**
   * changes the currently active path
   */
  setActivePath?: (x?: string) => void;
};

export const TreeContext = createContext<TreeContextType>({
  isCollapsed: true,
  setIsCollapsed: () => undefined,
  activePath: undefined,
  setActivePath: () => undefined,
});
