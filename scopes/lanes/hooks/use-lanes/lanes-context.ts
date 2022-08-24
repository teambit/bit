import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { createContext, useContext } from 'react';

export type LanesContextModel = {
  lanesModel?: LanesModel;
  updateLanesModel?: (updatedLanes?: LanesModel) => void;
};

export const LanesContext: React.Context<LanesContextModel | undefined> = createContext<LanesContextModel | undefined>(
  undefined
);

export const useLanesContext: () => LanesContextModel | undefined = () => {
  const lanesContext = useContext(LanesContext);
  return lanesContext;
};
