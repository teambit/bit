import React, { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/**
 * Global "show all dependencies" toggle for the Dependencies compare view. Like `DiffModeProvider`, a
 * single value provided at the compare root controls every per-component deps table at once (driven by
 * the toolbar's Changed/All toggle), instead of each table owning its own toggle. `false` (the default)
 * shows only changed dependencies; `true` shows all.
 */
const DepsFilterContext = createContext<boolean>(false);

export function DepsFilterProvider({ showAll, children }: { showAll: boolean; children: ReactNode }) {
  return <DepsFilterContext.Provider value={showAll}>{children}</DepsFilterContext.Provider>;
}

export function useDepsFilter(): boolean {
  return useContext(DepsFilterContext);
}
