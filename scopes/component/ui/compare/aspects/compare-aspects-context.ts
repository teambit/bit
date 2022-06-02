import { createContext, useContext } from 'react';
import { ComponentAspectData } from './compare-aspects';

export type ComponentCompareAspectsModel = {
  base: ComponentAspectData[];
  compare: ComponentAspectData[];
  loading?: boolean;
};

export const ComponentCompareAspectsContext = createContext<ComponentCompareAspectsModel | undefined>(undefined);
export const useAspectCompare: () => ComponentCompareAspectsModel | undefined = () => {
  const componentCompareAspectsContext = useContext(ComponentCompareAspectsContext);
  return componentCompareAspectsContext;
};
