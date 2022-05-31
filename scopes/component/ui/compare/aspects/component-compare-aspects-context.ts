import { createContext, useContext } from 'react';
import { ComponentAspectData } from './component-compare-aspects';

export type ComponentCompareAspectsModel = {
  base: ComponentAspectData[];
  compare: ComponentAspectData[];
  loading?: boolean;
};

export const ComponentCompareAspectsContext = createContext<ComponentCompareAspectsModel | undefined>(undefined);
export const useComponentCompareAspectsContext: () => ComponentCompareAspectsModel | undefined = () => {
  const componentCompareAspectsContext = useContext(ComponentCompareAspectsContext);
  return componentCompareAspectsContext;
};
