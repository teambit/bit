import { createContext, useContext } from 'react';
import { ComponentCompareAspectsModel } from '@teambit/component.ui.component-compare.compare-aspects.models.component-compare-aspects-model';

export const ComponentCompareAspectsContext = createContext<ComponentCompareAspectsModel | undefined>(undefined);
export const useAspectCompare: () => ComponentCompareAspectsModel | undefined = () => {
  const componentCompareAspectsContext = useContext(ComponentCompareAspectsContext);
  return componentCompareAspectsContext;
};
