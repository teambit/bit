import React, { ReactNode, useMemo } from 'react';
import { useLanesQuery, LanesModel } from '@teambit/lanes.ui.lanes';
import { LanesContext } from './lanes-context';

export type LanesProviderProps = {
  children: ReactNode;
  viewedLaneId?: string;
};

export function LanesProvider({ children, viewedLaneId }: LanesProviderProps) {
  const { lanes, checkedoutLane } = useLanesQuery();

  const model = useMemo(
    () =>
      new LanesModel({
        lanes,
        viewedLane: lanes?.find((lane) => {
          return viewedLaneId === lane.id;
        }),
        checkedoutLane: lanes?.find((lane) => {
          return checkedoutLane === lane.name;
        }),
      }),
    [lanes, viewedLaneId, checkedoutLane]
  );

  return <LanesContext.Provider value={model}>{children}</LanesContext.Provider>;
}
