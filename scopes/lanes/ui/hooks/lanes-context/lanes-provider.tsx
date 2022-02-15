import React, { ReactNode, useReducer, useEffect, useMemo } from 'react';
import { useLanes, LanesModel, LaneModel } from '@teambit/lanes.ui.lanes';
import { LanesContext } from './lanes-context';
import { LanesContextType } from '.';

export enum LanesActionTypes {
  UPDATE_LANES = 'UPDATE_LANES',
  UPDATE_CURRENT_LANE = 'UPDATE_CURRENT_LANE',
  UPDATE_LANE = 'UPDATE_LANE',
}
export type LanesUpdateLanesAction = {
  type: LanesActionTypes.UPDATE_LANES;
  payload: LanesModel;
};
export type LanesUpdateLaneAction = {
  type: LanesActionTypes.UPDATE_LANE;
  payload: LaneModel;
};
export type LanesUpdateCurrentLaneAction = {
  type: LanesActionTypes.UPDATE_CURRENT_LANE;
  payload?: LaneModel;
};
export type LanesActions = LanesUpdateLanesAction | LanesUpdateLaneAction | LanesUpdateCurrentLaneAction;

export type LanesProviderProps = {
  children: ReactNode;
  currentLaneUrl?: string;
};

const lanesReducer = (state: LanesModel, action: LanesActions) => {
  switch (action.type) {
    case LanesActionTypes.UPDATE_LANES: {
      return action.payload;
    }
    case LanesActionTypes.UPDATE_LANE: {
      const updatedLanes = state.lanes.map((existingLane) => {
        if (existingLane.id === action.payload.id) {
          return action.payload;
        }
        return existingLane;
      });
      return new LanesModel({ lanes: updatedLanes, currentLane: state.currentLane });
    }
    case LanesActionTypes.UPDATE_CURRENT_LANE: {
      return new LanesModel({ lanes: state.lanes, currentLane: action.payload });
    }
    default:
      return state;
  }
};

export function LanesProvider({ children, currentLaneUrl }: LanesProviderProps) {
  const { lanesModel, loading } = useLanes();
  const [state, dispatch] = useReducer<typeof lanesReducer>(lanesReducer, lanesModel);
  const currentLane = useMemo(
    () =>
      state?.lanes.find((lane) => {
        return currentLaneUrl === lane.url;
      }),
    [currentLaneUrl, state.lanes]
  );

  const context: LanesContextType = {
    model: {
      ...state,
      currentLane,
    },
    updateCurrentLane: (lane?: LaneModel) => dispatch({ type: LanesActionTypes.UPDATE_CURRENT_LANE, payload: lane }),
    updateLane: (lane: LaneModel) => dispatch({ type: LanesActionTypes.UPDATE_LANE, payload: lane }),
    updateLanes: (lanes: LanesModel) => dispatch({ type: LanesActionTypes.UPDATE_LANES, payload: lanes }),
  };

  useEffect(() => {
    if (!loading) {
      context.updateLanes(lanesModel);
    }
  }, [loading]);

  return <LanesContext.Provider value={context}>{children}</LanesContext.Provider>;
}
