import { createContext, useContext } from 'react';
import type { ComponentDescriptor } from '@teambit/component-descriptor';

import { ComponentModel } from '../component-model';

export const ComponentContext: React.Context<ComponentModel> = createContext<ComponentModel>(ComponentModel.empty());
export const ComponentDescriptorContext: React.Context<ComponentDescriptor | undefined> = createContext<
  ComponentDescriptor | undefined
>(undefined);

export const useComponentDescriptor = () => useContext(ComponentDescriptorContext);
