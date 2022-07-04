import { createContext, useContext } from 'react';
import { ComponentID } from '@teambit/component-id';
import type { toUrlOptions } from './component-url';

export type ComponentUrlResolver = (id: ComponentID, options?: toUrlOptions) => string | undefined;

export const ComponentUrlContext = createContext<ComponentUrlResolver | undefined>(undefined);

export const ComponentUrlProvider = ComponentUrlContext.Provider;

export const useComponentUrl: ComponentUrlResolver = (id, options) => {
  const urlFunc = useContext(ComponentUrlContext);
  return urlFunc?.(id, options);
};
