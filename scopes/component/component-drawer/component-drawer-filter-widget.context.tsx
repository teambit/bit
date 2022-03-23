import React, { createContext, ReactNode, useState } from 'react';

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
