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
};

export const TreeContext = createContext<TreeContextType>({
  isCollapsed: true,
  setIsCollapsed: () => undefined,
});
