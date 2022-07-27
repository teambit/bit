import { createContext, useContext } from 'react';
import { ComponentModel } from '@teambit/component';
import { LegacyComponentLog } from '@teambit/legacy-component-log';

export type ComponentCompareComponentModel = {
  model: ComponentModel;
  hasLocalChanges?: boolean;
};

export type ComponentCompareModel = {
  base?: ComponentCompareComponentModel;
  compare: ComponentCompareComponentModel;
  loading?: boolean;
  logsByVersion: Map<string, LegacyComponentLog>;
};

export const ComponentCompareContext = createContext<ComponentCompareModel | undefined>(undefined);
export const useComponentCompare: () => ComponentCompareModel | undefined = () => {
  const componentCompareContext = useContext(ComponentCompareContext);
  return componentCompareContext;
};
