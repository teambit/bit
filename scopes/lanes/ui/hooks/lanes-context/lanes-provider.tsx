import React, { ReactNode } from 'react';
import { useLanes } from '../use-lanes';
import { LanesContext } from './lanes-context';

export type LanesProviderProps = {
  children: ReactNode;
  viewedLaneId?: string;
};

export function LanesProvider({ children, viewedLaneId }: LanesProviderProps) {
  const { lanesModel } = useLanes(() => viewedLaneId);
  return <LanesContext.Provider value={lanesModel}>{children}</LanesContext.Provider>;
}
