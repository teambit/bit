import React, { ReactNode } from 'react';
import { LanesState } from './lanes-state';
import { LanesContext } from './lanes-context';

export type LanesProviderProps = {
  lanesState: LanesState;
  children: ReactNode;
};

/**
 * context provider of the lanes
 */
export function LanesProvider({ lanesState, children }: LanesProviderProps) {
  return <LanesContext.Provider value={lanesState}>{children}</LanesContext.Provider>;
}
