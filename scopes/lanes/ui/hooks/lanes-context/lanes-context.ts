import { ComponentID } from '@teambit/component-id';
import { createContext, useContext } from 'react';
import { LaneModel } from '.';
import { LanesModel, getLaneUrl, getLaneComponentUrl } from './lanes-model';

export type LanesContextType = {
  model?: LanesModel;
  updateCurrentLane: (currentLane?: LaneModel) => void;
  updateLanes: (lanes: LaneModel[]) => void;
  updateLane: (lane: LaneModel) => void;
  getLaneUrl: (laneId: string) => string;
  getLaneComponentUrl: (componentId: ComponentID, laneId?: string) => string;
};
const defaultLanesContext: LanesContextType = {
  updateCurrentLane: () => {},
  updateLanes: () => {},
  updateLane: () => {},
  getLaneUrl,
  getLaneComponentUrl,
};

export const LanesContext: React.Context<LanesContextType> = createContext<LanesContextType>(defaultLanesContext);
export const useLanesContext = () => useContext(LanesContext);
