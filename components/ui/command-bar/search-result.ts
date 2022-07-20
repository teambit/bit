import { ReactNode } from 'react';

export type Keybinding = string | string[]; // TODO

export type SearchResult = {
  id: string;
  action: Function|string;
  children: ReactNode;
  Icon?: ReactNode
};
