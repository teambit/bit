import React, { ReactNode } from 'react';
import { LanesState } from '../../state/lanes.state';
import { LanesContext } from './lanes-context';

export type LanesProviderProps = {
  lanes: LanesState;
  children: ReactNode;
};

/**
 * context provider of the lanes
 */
export function LanesProvider({ lanes, children }: LanesProviderProps) {
  return <LanesContext.Provider value={lanes}>{children}</LanesContext.Provider>;
}
