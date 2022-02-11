import React, { ReactNode, useReducer, useEffect } from 'react';
import { useLanes, LanesModel, LaneModel } from '@teambit/lanes.lanes.ui';
import { LanesContext } from './lanes-context';

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

export function LanesProvider({ children }: LanesProviderProps) {
  const { lanesModel, loading } = useLanes();
  const [state, dispatch] = useReducer<typeof lanesReducer>(lanesReducer, lanesModel);
  useEffect(() => {
    if (!loading) {
      dispatch({ type: LanesActionTypes.UPDATE_LANES, payload: lanesModel });
    }
  }, [loading]);
  return <LanesContext.Provider value={{ model: state, dispatch }}>{children}</LanesContext.Provider>;
}
