import React, { ReactNode, useMemo } from 'react';
import { useLanes, LanesModel } from '@teambit/lanes.ui.lanes';
import { LanesContext } from './lanes-context';

export type LanesProviderProps = {
  children: ReactNode;
  currentLaneId?: string;
};

export function LanesProvider({ children, currentLaneId }: LanesProviderProps) {
  const { lanes } = useLanes();

  const model = useMemo(
    () =>
      new LanesModel({
        lanes: lanes,
        currentLane: lanes.find((lane) => {
          return currentLaneId === lane.id;
        }),
      }),
    [lanes, currentLaneId]
  );

  return <LanesContext.Provider value={model}>{children}</LanesContext.Provider>;
}
