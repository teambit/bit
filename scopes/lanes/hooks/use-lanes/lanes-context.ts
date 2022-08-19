import { createContext, useContext } from 'react';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';

export const LanesContext: React.Context<LanesModel | undefined> = createContext<LanesModel | undefined>(undefined);
export const useLanesContext: () => LanesModel | undefined = () => {
  const lanesContext = useContext(LanesContext);
  return lanesContext;
};
