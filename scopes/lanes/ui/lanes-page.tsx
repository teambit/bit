import React, { useEffect } from 'react';
import { LanesActionTypes, LanesUpdateCurrentLaneAction, useLanesContext } from '@teambit/lanes.lanes.ui';
import { useLocation } from '@teambit/react-router';

export function LanesPage() {
  const { model, dispatch } = useLanesContext();
  const location = useLocation();

  useEffect(() => {
    const currentLaneFromURL = model.lanes.find((lane) => {
      return location.pathname === lane.url;
    });
    const action: LanesUpdateCurrentLaneAction = {
      type: LanesActionTypes.UPDATE_CURRENT_LANE,
      payload: currentLaneFromURL,
    };
    dispatch(action);
    return () => dispatch({ ...action, payload: undefined });
  }, [location.pathname, model.lanes]);
  return <></>;
}
