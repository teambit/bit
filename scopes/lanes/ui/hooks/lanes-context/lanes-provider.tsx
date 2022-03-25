import React, { ReactNode, useMemo } from 'react';
import { useLanesQuery, LanesModel } from '@teambit/lanes.ui.lanes';
import { LanesContext } from './lanes-context';

export type LanesProviderProps = {
  children: ReactNode;
  currentLaneId?: string;
};

export function LanesProvider({ children, currentLaneId }: LanesProviderProps) {
  const { lanes, checkedoutLane } = useLanesQuery();

  const model = useMemo(
    () =>
      new LanesModel({
        lanes,
        currentLane: lanes?.find((lane) => {
          return currentLaneId === lane.id;
        }),
        checkedoutLane: lanes?.find((lane) => {
          return checkedoutLane === lane.name;
        }),
      }),
    [lanes, currentLaneId, checkedoutLane]
  );

  return <LanesContext.Provider value={model}>{children}</LanesContext.Provider>;
}
