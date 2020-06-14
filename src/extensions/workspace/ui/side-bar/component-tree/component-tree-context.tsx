import { createContext } from 'react';
export interface IComponentTreeContext {
  onSelect: (id: string) => any;
  selected?: string;
}

export const ComponentTreeContext = createContext({
  onSelect: (id: string) => {},
  selected: undefined
});
