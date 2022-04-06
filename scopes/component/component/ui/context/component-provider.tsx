import React, { ReactNode } from 'react';
import type { ComponentDescriptor } from '@teambit/component-descriptor';
import { ComponentModel } from '../component-model';
import { ComponentContext, ComponentDescriptorContext } from './component-context';

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

export type ComponentDescriptorProviderProps = {
  /**
   * component model.
   */
  componentDescriptor?: ComponentDescriptor;

  /**
   * component children.
   */
  children: ReactNode;
};

export function ComponentDescriptorProvider({ componentDescriptor, children }: ComponentDescriptorProviderProps) {
  return (
    <ComponentDescriptorContext.Provider value={componentDescriptor}>{children}</ComponentDescriptorContext.Provider>
  );
}
