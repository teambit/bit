import React, { createContext, ReactNode, useState } from 'react';
import { SlotRegistry } from '@teambit/harmony';

export type DrawerWidgetSlot = SlotRegistry<ReactNode[]>;
export type ComponentTreeContextType = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
};

export const ComponentTreeContext = createContext<ComponentTreeContextType>({
  collapsed: false,
  setCollapsed: () => {},
});

export const ComponentTreeProvider = ({ children }: { children: ReactNode }) => {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  return <ComponentTreeContext.Provider value={{ collapsed, setCollapsed }}>{children}</ComponentTreeContext.Provider>;
};

export type ComponentFilterWidgetContextType = {
  filterWidgetOpen: boolean;
  setFilterWidget: (open: boolean) => void;
};

export const ComponentFilterWidgetContext = createContext<ComponentFilterWidgetContextType>({
  filterWidgetOpen: false,
  setFilterWidget: () => {},
});

export const ComponentFilterWidgetProvider = ({ children }: { children: ReactNode }) => {
  const [filterWidgetOpen, setFilterWidget] = useState<boolean>(false);
  return (
    <ComponentFilterWidgetContext.Provider value={{ filterWidgetOpen, setFilterWidget }}>
      {children}
    </ComponentFilterWidgetContext.Provider>
  );
};
