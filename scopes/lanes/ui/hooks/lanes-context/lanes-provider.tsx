import React, { ReactNode, useState, useContext, useEffect } from 'react';
import { useLanes, LanesHost } from '@teambit/lanes.lanes.ui';
import { ReactRouterUI, useLocation } from '@teambit/react-router';
import { LanesContext, LanesContextType } from './lanes-context';
import { groupByScope, LanesModel, groupByComponentHash } from './lanes-model';

export type LanesProviderProps = {
  host: LanesHost;
  reactRouter: ReactRouterUI;
  children: ReactNode;
};

/**
 * context provider of the lanes
 */
export function LanesProvider({ host, children, reactRouter }: LanesProviderProps) {
  const defaultContext = useContext(LanesContext);
  const [model, setModel] = useState<LanesModel>({});
  const lanesModel = useLanes(host);
  const { pathname } = useLocation();

  let currentLaneFromURL;
  useEffect(() => {
    currentLaneFromURL = lanesModel?.lanes?.list.find((lane) => {
      return pathname && pathname.includes(defaultContext.getLaneUrl(lane));
    });

    if (!currentLaneFromURL && !!lanesModel.currentLane) {
      reactRouter.navigateTo(defaultContext.getLaneUrl(lanesModel.currentLane));
    }
  }, [lanesModel, pathname]);

  const context: LanesContextType = {
    ...defaultContext,
    model: { ...lanesModel, currentLane: currentLaneFromURL },
    updateCurrentLane: (currentLane) => {
      const updatedModel = {
        ...(model || {}),
        currentLane,
      };
      setModel(updatedModel);
    },
    updateLanes: (lanes) => {
      const updatedModel = {
        ...(model || {}),
        lanes: {
          list: lanes,
          byScope: groupByScope(lanes),
          byComponentHash: groupByComponentHash(lanes),
        },
      };
      setModel(updatedModel);
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
  };
  return <LanesContext.Provider value={context}>{children}</LanesContext.Provider>;
}
