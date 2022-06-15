import { createContext, useContext } from 'react';
import { ComponentModel } from '@teambit/component';
import { LegacyComponentLog } from '@teambit/legacy-component-log';

export type ComponentCompareComponentModel = {
  model: ComponentModel;
  versionInfo?: LegacyComponentLog;
  isLocalChanges?: boolean;
};

export type ComponentCompareModel = {
  base?: ComponentCompareComponentModel;
  compare: ComponentCompareComponentModel;
  loading?: boolean;
};

export const ComponentCompareContext = createContext<ComponentCompareModel | undefined>(undefined);
export const useComponentCompare: () => ComponentCompareModel | undefined = () => {
  const componentCompareContext = useContext(ComponentCompareContext);
  return componentCompareContext;
};
