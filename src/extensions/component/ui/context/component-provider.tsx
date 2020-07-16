import React, { ReactNode } from 'react';
import { ComponentContext } from './component-context';
import { ComponentModel } from '../component-model';

export type ComponentProviderProps = {
  /**
   * component model.
   */
  component: ComponentModel;

  /**
   * component children.
   */
  children: ReactNode;
};

export function ComponentProvider({ component, children }: ComponentProviderProps) {
  return <ComponentContext.Provider value={component}>{children}</ComponentContext.Provider>;
}
