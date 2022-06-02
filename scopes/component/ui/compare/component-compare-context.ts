import { createContext, useContext } from 'react';
import { ComponentModel } from '@teambit/component';

export type ComponentCompareModel = {
  base?: ComponentModel;
  compare: ComponentModel;
  loading?: boolean;
  isCompareVersionWorkspace?: boolean;
};

export const ComponentCompareContext = createContext<ComponentCompareModel | undefined>(undefined);
export const useComponentCompare: () => ComponentCompareModel | undefined = () => {
  const componentCompareContext = useContext(ComponentCompareContext);
  return componentCompareContext;
};
