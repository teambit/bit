import React, { useContext, useEffect } from 'react';
import { LanesContext, baseLaneRoute } from '@teambit/lanes.lanes.ui';
import { useLocation } from '@teambit/react-router';

export function LanesPage() {
  const { model, updateCurrentLane } = useContext(LanesContext);
  const { pathname } = useLocation();

  useEffect(() => {
    const currentLaneFromURL =
      !!pathname && pathname.includes(baseLaneRoute)
        ? model?.lanes?.list.find((lane) => {
            return pathname.split(baseLaneRoute)[1] === lane.id;
          })
        : undefined;
    if (currentLaneFromURL && !model?.currentLane) updateCurrentLane?.(currentLaneFromURL);
  }, [pathname]);
  return <></>;
}
