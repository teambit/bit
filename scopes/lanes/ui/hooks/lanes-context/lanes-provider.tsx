import React, { ReactNode, useState, useContext, useMemo } from 'react';
import { useLanes, LanesHost } from '@teambit/lanes.lanes.ui';
import { ReactRouterUI, useLocation } from '@teambit/react-router';
import { LanesContext, LanesContextType } from './lanes-context';
import { groupByScope, LanesModel, groupByComponentHash, LaneModel, baseLaneRoute } from './lanes-model';

export type LanesProviderProps = {
  host: LanesHost;
  reactRouter: ReactRouterUI;
  children: ReactNode;
};

export function LanesProvider({ host, children, reactRouter }: LanesProviderProps) {
  const [model, setModel] = useState<LanesModel>({});
  const defaultContext = useContext(LanesContext);
  const initialLaneState = useLanes(host);
  if (!!initialLaneState.lanes && !model.lanes) setModel(initialLaneState);
  const { pathname } = useLocation();

  let currentLaneFromURL: LaneModel | undefined;

  useMemo(() => {
    currentLaneFromURL =
      !!pathname && pathname.includes(baseLaneRoute)
        ? model?.lanes?.list.find((lane) => {
            return pathname.split(baseLaneRoute)[1] === lane.id;
          })
        : undefined;
    // redirect to the lane view only on a workspace when spinning up for the first time
    if (pathname === '/' && !currentLaneFromURL && !!model?.currentLane) {
      reactRouter.navigateTo(model?.currentLane.url);
    }
  }, [pathname, model]);

  const context: LanesContextType = {
    ...defaultContext,
    model: {
      ...model,
      currentLane: currentLaneFromURL || model?.currentLane,
    },
    getLaneComponentUrl: (componentId, laneId) => {
      if (laneId) return defaultContext.getLaneComponentUrl(componentId, laneId);
      return componentId.version && context.model?.lanes?.byComponentHash
        ? defaultContext.getLaneComponentUrl(componentId, context.model?.lanes?.byComponentHash[componentId.version])
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
      lanes.forEach((lane) => context.updateLane(lane));
    },
  };

  return <LanesContext.Provider value={context}>{children}</LanesContext.Provider>;
}
