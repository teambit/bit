import React, { createContext, useContext, useMemo, ReactNode } from 'react';

export type LinkContext = {
  baseUrl?: string;
};

const linkContext = createContext<LinkContext>({});

export function LinkContextProvider({ baseUrl, children }: LinkContext & { children: ReactNode }) {
  const value = useMemo(() => ({ baseUrl }), [baseUrl]);
  return <linkContext.Provider value={value}>{children}</linkContext.Provider>;
}

export function useLinkContext() {
  return useContext(linkContext);
}
