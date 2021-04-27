import { createContext, ComponentType } from 'react';

export type Components = {
  [identifier: string]: ComponentType;
};

export const MDXScopeContext = createContext<Components>({});
