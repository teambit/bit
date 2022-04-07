import { ReactNode } from 'react';

export type Keybinding = string | string[]; // TODO

export type SearchResult = {
  id: string;
  handler: Function;
  children: ReactNode;
};
