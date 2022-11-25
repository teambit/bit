import { ComponentCompareModel } from '@teambit/component.ui.component-compare.models.component-compare-model';
import { ComponentCompareState } from '@teambit/component.ui.component-compare.models.component-compare-state';
import { createContext, useContext } from 'react';

export type ComponentCompareContextType = ComponentCompareModel & { state?: ComponentCompareState };

export const ComponentCompareContext = createContext<ComponentCompareContextType | undefined>(undefined);

export const useComponentCompare: () => ComponentCompareContextType | undefined = () => {
  const componentCompareContext = useContext(ComponentCompareContext);
  return componentCompareContext;
};
