import React, { useContext, useEffect } from 'react';
import { LanesContext } from '@teambit/lanes.lanes.ui';
import { useLocation } from '@teambit/react-router';

export function LanesPage() {
  const { model, updateCurrentLane } = useContext(LanesContext);
  const location = useLocation();

  useEffect(() => {
    const currentLaneFromURL = model?.lanes?.list.find((lane) => {
      return location.pathname === lane.url;
    });
    updateCurrentLane?.(currentLaneFromURL);
    return () => updateCurrentLane?.(undefined);
  }, [location.pathname]);
  return <></>;
}
