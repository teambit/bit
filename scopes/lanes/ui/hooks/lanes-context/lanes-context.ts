import { createContext, useContext } from 'react';
import { LanesModel, LaneModel } from './lanes-model';

export type LanesContextType = {
  model: LanesModel;
  updateCurrentLane: (lane?: LaneModel) => void;
  updateLanes: (lanes: LanesModel) => void;
  updateLane: (lane: LaneModel) => void;
};

export const LanesContext: React.Context<LanesContextType | undefined> = createContext<LanesContextType | undefined>(
  undefined
);
export const useLanesContext: () => LanesContextType | undefined = () => {
  const lanesContext = useContext(LanesContext);
  return lanesContext;
};
