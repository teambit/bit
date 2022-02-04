import { ComponentID } from '@teambit/component-id';
import { createContext, useContext } from 'react';
import { LaneModel } from '.';
import { LanesModel, baseLaneRoute } from './lanes-model';

export type LanesContextType = {
  model?: LanesModel;
  updateCurrentLane: (currentLane?: LaneModel) => void;
  updateLanes: (lanes: LaneModel[]) => void;
  updateLane: (lane: LaneModel) => void;
  getLaneUrl: (lane: LaneModel) => string;
  getLaneComponentUrl: (lane: LaneModel, componentId: ComponentID) => string;
};
const defaultLanesContext: LanesContextType = {
  updateCurrentLane: () => {},
  updateLanes: () => {},
  updateLane: () => {},
  getLaneUrl: (lane) => `${baseLaneRoute}/${lane.id}`,
  getLaneComponentUrl: (lane: LaneModel, componentId: ComponentID) =>
    `${baseLaneRoute}/${lane.id}/${componentId.toStringWithoutVersion()}?version=${componentId.version}`,
};

export const LanesContext: React.Context<LanesContextType> = createContext<LanesContextType>(defaultLanesContext);
export const useLanesContext = () => useContext(LanesContext);
