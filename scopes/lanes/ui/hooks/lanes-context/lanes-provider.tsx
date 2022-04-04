import React, { ReactNode } from 'react';
import { useLanesQuery } from '@teambit/lanes.ui.lanes';
import { LanesContext } from './lanes-context';

export type LanesProviderProps = {
  children: ReactNode;
  viewedLaneId?: string;
};

export function LanesProvider({ children, viewedLaneId }: LanesProviderProps) {
  const { lanes } = useLanesQuery(viewedLaneId);
  return <LanesContext.Provider value={lanes}>{children}</LanesContext.Provider>;
}
