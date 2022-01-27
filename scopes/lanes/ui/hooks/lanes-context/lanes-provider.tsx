import React, { ReactNode } from 'react';
import { LanesModel } from './lanes-model';
import { LanesContext } from './lanes-context';

export type LanesProviderProps = {
  lanesState: LanesModel;
  children: ReactNode;
};

/**
 * context provider of the lanes
 */
export function LanesProvider({ lanesState, children }: LanesProviderProps) {
  return <LanesContext.Provider value={lanesState}>{children}</LanesContext.Provider>;
}
