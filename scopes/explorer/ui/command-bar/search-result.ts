import { ReactNode } from 'react';

export type Keybinding = string | string[]; // TODO

export type CommanderSearchResult = {
  id: string;
  // TODO - rename to action
  handler: Function;
  children: ReactNode;
};
