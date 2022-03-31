import React, { ReactNode, useMemo } from 'react';
import { useLanesQuery, LanesModel } from '@teambit/lanes.ui.lanes';
import { LanesContext } from './lanes-context';

export type LanesProviderProps = {
  children: ReactNode;
  viewedLaneId?: string;
};

export function LanesProvider({ children, viewedLaneId }: LanesProviderProps) {
  const { lanes, currentLane } = useLanesQuery();

  const model = useMemo(
    () =>
      new LanesModel({
        lanes,
        viewedLane: lanes?.find((lane) => {
          return viewedLaneId === lane.id;
        }),
        currentLane: lanes?.find((lane) => {
          return currentLane === lane.name;
        }),
      }),
    [lanes, viewedLaneId, currentLane]
  );

  return <LanesContext.Provider value={model}>{children}</LanesContext.Provider>;
}
