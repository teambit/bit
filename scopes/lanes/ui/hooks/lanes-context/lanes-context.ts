import { createContext, useContext, Dispatch } from 'react';
import { LanesModel } from './lanes-model';
import { LanesActions } from './lanes-provider';

export type LanesContextType = { model: LanesModel; dispatch: Dispatch<LanesActions> };

export const LanesContext: React.Context<LanesContextType | undefined> = createContext<LanesContextType | undefined>(
  undefined
);
export const useLanesContext: () => LanesContextType = () => {
  const lanesContext = useContext(LanesContext);
  if (!lanesContext) {
    throw new Error('Missing LanesContext.Provider');
  }
  return lanesContext;
};
