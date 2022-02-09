import React, { ReactNode, useState, useEffect } from 'react';
import {
  useLanes,
  groupByScope,
  LanesModel,
  groupByComponentHash,
  getLaneComponentUrl,
  getLaneUrl,
} from '@teambit/lanes.lanes.ui';
import { LanesContext, LanesContextType } from './lanes-context';

export type LanesProviderProps = {
  children: ReactNode;
};

export function LanesProvider({ children }: LanesProviderProps) {
  const initialLaneState = useLanes();
  const [model, setModel] = useState<LanesModel>(initialLaneState);
  useEffect(() => {
    if (initialLaneState.lanes && !model.lanes) setModel(initialLaneState);
  }, [initialLaneState.lanes, model.lanes]);

  const context: LanesContextType = {
    model,
    getLaneUrl,
    getLaneComponentUrl: (componentId, laneId) => {
      if (laneId) return getLaneComponentUrl(componentId, laneId);
      return componentId.version && context.model?.lanes?.byComponentHash
        ? getLaneComponentUrl(componentId, context.model?.lanes?.byComponentHash[componentId.version])
        : '';
    },
    updateCurrentLane: (currentLane) => {
      setModel({ ...model, currentLane });
    },
    updateLane: (lane) => {
      const updatedLanes = (model?.lanes?.list || []).map((existingLane) => {
        if (existingLane.id === lane.id) {
          return lane;
        }
        return lane;
      });
      const updatedModel = {
        ...(model || {}),
        lanes: {
          list: updatedLanes,
          byScope: groupByScope(updatedLanes),
          byComponentHash: groupByComponentHash(updatedLanes),
        },
      };
      setModel(updatedModel);
    },
    updateLanes: (lanes) => {
      setModel(lanes);
    },
  };

  return <LanesContext.Provider value={context}>{children}</LanesContext.Provider>;
}
