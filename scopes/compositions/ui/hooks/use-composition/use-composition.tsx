import React, { createContext, useContext, useMemo, ReactNode, Dispatch, SetStateAction } from 'react';

type CompositionsContext = {
  queryParams: Record<string, any>;
  setQueryParams: Dispatch<SetStateAction<Record<string, any>>>;
};

const CompositionsCtx = createContext<CompositionsContext>({ queryParams: {}, setQueryParams: () => {} });

export type CompositionContextProviderProps = {
  children: ReactNode;
} & CompositionsContext;

export function CompositionContextProvider({ children, queryParams, setQueryParams }: CompositionContextProviderProps) {
  const state = useMemo(
    () => ({
      queryParams,
      setQueryParams,
    }),
    [queryParams, setQueryParams]
  );

  return <CompositionsCtx.Provider value={state}>{children}</CompositionsCtx.Provider>;
}

export function usePreview() {
  return useContext(CompositionsCtx);
}
