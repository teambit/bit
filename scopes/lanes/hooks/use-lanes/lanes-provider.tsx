import React, { ReactNode } from 'react';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LaneId } from '@teambit/lane-id';
import { LanesContext } from './lanes-context';

export type LanesProviderProps = {
  children: ReactNode;
  viewedLaneId?: LaneId;
};

export function LanesProvider({ children, viewedLaneId }: LanesProviderProps) {
  const { lanesModel } = useLanes(() => viewedLaneId);
  return <LanesContext.Provider value={lanesModel}>{children}</LanesContext.Provider>;
}
