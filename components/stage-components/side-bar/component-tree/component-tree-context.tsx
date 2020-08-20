import React, { createContext, useMemo, ReactNode } from 'react';

export interface ComponentTreeContextType {
  onSelect?: (id: string, event?: React.MouseEvent) => any;
  selected?: string;
}

export const ComponentTreeContext = createContext<ComponentTreeContextType>({
  onSelect: () => {},
  selected: undefined,
});

export function ComponentTreeContextProvider({
  onSelect,
  selected,
  children,
}: ComponentTreeContextType & { children: ReactNode }) {
  const context = useMemo(() => ({ onSelect, selected }), [onSelect, selected]);

  return <ComponentTreeContext.Provider value={context}>{children}</ComponentTreeContext.Provider>;
}
