import React, { createContext, ReactNode, useState } from 'react';

export type ComponentTreeContextType = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
};

export const ComponentTreeContext = createContext<ComponentTreeContextType>({
  collapsed: true,
  setCollapsed: () => {},
});

export const ComponentTreeProvider = ({ children }: { children: ReactNode }) => {
  const [collapsed, setCollapsed] = useState<boolean>(true);
  return <ComponentTreeContext.Provider value={{ collapsed, setCollapsed }}>{children}</ComponentTreeContext.Provider>;
};
