import React, { ReactNode } from 'react';
import { Component } from '../../../component/component.ui';
import { ComponentContext } from './component-context';

export type ComponentProviderProps = {
  /**
   * instance of the selected component.
   */
  component: Component;

  /**
   * react children.
   */
  children: ReactNode;
};

export function ComponentProvider({ component, children }: ComponentProviderProps) {
  return <ComponentContext.Provider value={component}>{children}</ComponentContext.Provider>;
}
