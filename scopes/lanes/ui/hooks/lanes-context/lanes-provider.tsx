import React, { ReactNode, useMemo } from 'react';
import { useLanesQuery } from '@teambit/lanes.ui.lanes';
import { LanesContext } from './lanes-context';

export type LanesProviderProps = {
  children: ReactNode;
  viewedLaneId?: string;
};

export function LanesProvider({ children, viewedLaneId }: LanesProviderProps) {
  const { lanes } = useLanesQuery();

  const model = useMemo(() => {
    lanes?.setViewedLane(viewedLaneId);
    return lanes;
  }, [lanes, viewedLaneId]);

  return <LanesContext.Provider value={model}>{children}</LanesContext.Provider>;
}
