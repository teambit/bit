import React, { useContext, createContext, ReactNode } from 'react';

type SingletonObject = any;
// topic: will be used in the future to specify which context to be used, when having more than one tooltip set

const singletonContext = createContext<SingletonObject | undefined>(undefined);

export type ProvideTooltipInstanceProps = {
  value?: SingletonObject;
  children: ReactNode;
  /* topic: string; */
};

export function ProvideTooltipInstance({ value, children }: ProvideTooltipInstanceProps) {
  return <singletonContext.Provider value={value}>{children}</singletonContext.Provider>;
}

export function useCtxTooltipInstance(/* topic?: string */): SingletonObject | undefined {
  return useContext(singletonContext);
}
