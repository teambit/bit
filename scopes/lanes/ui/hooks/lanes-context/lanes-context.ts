import { ComponentID } from '@teambit/component-id';
import { createContext, useContext } from 'react';
import { LaneModel } from '.';
import { LanesModel } from './lanes-model';

export type LanesContextType = Partial<{
  model: LanesModel;
  updateCurrentLane: (currentLane?: LaneModel) => void;
  updateLanes: (lanes: LanesModel) => void;
  updateLane: (lane: LaneModel) => void;
  getLaneUrl: (laneId: string) => string;
  getLaneComponentUrl: (componentId: ComponentID, laneId?: string) => string;
}>;

export const LanesContext: React.Context<LanesContextType> = createContext<LanesContextType>({});
export const useLanesContext = () => useContext(LanesContext);
