import React, { createContext, ReactNode, useState, useContext } from 'react';
import { SlotRegistry } from '@teambit/harmony';

export type DrawerWidgetSlot = SlotRegistry<ReactNode[]>;
export type ComponentTreeContextType = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
};

export const ComponentTreeContext = createContext<ComponentTreeContextType>({
  collapsed: true,
  setCollapsed: () => {},
});

export const ComponentTreeProvider = ({ children }: { children: ReactNode }) => {
  const { collapsed: defaultValue } = useContext(ComponentTreeContext);
  const [collapsed, setCollapsed] = useState<boolean>(defaultValue);
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
  const { filterWidgetOpen: defaultValue } = useContext(ComponentFilterWidgetContext);
  const [filterWidgetOpen, setFilterWidget] = useState<boolean>(defaultValue);
  return (
    <ComponentFilterWidgetContext.Provider value={{ filterWidgetOpen, setFilterWidget }}>
      {children}
    </ComponentFilterWidgetContext.Provider>
  );
};
