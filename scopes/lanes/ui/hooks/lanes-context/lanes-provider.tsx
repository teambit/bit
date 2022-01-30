import React, { ReactNode } from 'react';
import { LanesModel } from './lanes-model';
import { LanesContext } from './lanes-context';

export type LanesProviderProps = {
  lanesModel: LanesModel;
  children: ReactNode;
};

/**
 * context provider of the lanes
 */
export function LanesProvider({ lanesModel, children }: LanesProviderProps) {
  return <LanesContext.Provider value={lanesModel}>{children}</LanesContext.Provider>;
}
