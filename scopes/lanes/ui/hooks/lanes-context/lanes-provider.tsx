import React, { ReactNode, useState, useContext, useEffect } from 'react';
import { useLanes, LanesHost } from '@teambit/lanes.lanes.ui';
import { ReactRouterUI, useLocation } from '@teambit/react-router';
import { LanesContext, LanesContextType } from './lanes-context';
import { groupByScope, LanesModel, groupByComponentHash, LaneModel } from './lanes-model';

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

  useEffect(() => {
    currentLaneFromURL = model?.lanes?.list.find((lane) => {
      return pathname && pathname.includes(lane.url);
    });
    // redirect to the lane view
    if (!currentLaneFromURL && !!model?.currentLane) {
      reactRouter.navigateTo(model?.currentLane.url);
    }
  }, [pathname, model]);

  const context: LanesContextType = {
    ...defaultContext,
    model: {
      ...model,
      currentLane: !currentLaneFromURL ? model?.currentLane : model.currentLane,
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
