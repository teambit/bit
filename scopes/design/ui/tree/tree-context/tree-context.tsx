import { createContext } from 'react';

export type TreeContextType = {
  /**
   * is sidebar open
   */
  isCollapsed: boolean;
  /**
   * toggle sidebar
   */
  setIsCollapsed: (x: boolean) => void;
  /**
   * is sidebar open
   */
  activePath?: string | null;
  /**
   * toggle sidebar
   */
  setActivePath: (x?: string) => void;
};

export const TreeContext = createContext<TreeContextType>({
  isCollapsed: true,
  setIsCollapsed: () => undefined,
  activePath: null,
  setActivePath: () => undefined,
});
