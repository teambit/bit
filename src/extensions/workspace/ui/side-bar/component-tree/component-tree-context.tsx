import { createContext } from 'react';

export interface ComponentTreeContextType {
  onSelect: (id: string) => any;
  selected?: string;
}

export const ComponentTreeContext = createContext<ComponentTreeContextType>({
  onSelect: () => {},
  selected: undefined
});
