import React, { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export type DiffDisplayMode = 'split' | 'unified';

const DiffModeContext = createContext<DiffDisplayMode>('split');

export function DiffModeProvider({ mode, children }: { mode: DiffDisplayMode; children: ReactNode }) {
  return <DiffModeContext.Provider value={mode}>{children}</DiffModeContext.Provider>;
}

export function useDiffMode(): DiffDisplayMode {
  return useContext(DiffModeContext);
}
