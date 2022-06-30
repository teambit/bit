import { createContext, useContext } from 'react';
import { ComponentAspectData } from './use-compare-aspects-query';

export type ComponentCompareAspectsModel = {
  base: ComponentAspectData[];
  compare: ComponentAspectData[];
  loading?: boolean;
  selectedBase?: ComponentAspectData;
  selectedCompare?: ComponentAspectData;
  selected?: string;
};

export const ComponentCompareAspectsContext = createContext<ComponentCompareAspectsModel | undefined>(undefined);
export const useAspectCompare: () => ComponentCompareAspectsModel | undefined = () => {
  const componentCompareAspectsContext = useContext(ComponentCompareAspectsContext);
  return componentCompareAspectsContext;
};
