import { ComponentCompareModel } from '@teambit/component.ui.component-compare.models.component-compare-model';
import { createContext, useContext } from 'react';

export const ComponentCompareContext = createContext<ComponentCompareModel | undefined>(undefined);
export const useComponentCompare: () => ComponentCompareModel | undefined = () => {
  const componentCompareContext = useContext(ComponentCompareContext);
  return componentCompareContext;
};
