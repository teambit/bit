import { ComponentCompareHooksData } from '@teambit/component.ui.component-compare.models.component-compare-hooks';
import { ComponentCompareStateData } from '@teambit/component.ui.component-compare.models.component-compare-state';
import { createContext, useContext } from 'react';
import { ComponentAspectData } from './use-compare-aspects-query';

export type ComponentCompareAspectsModel = {
  base: ComponentAspectData[];
  compare: ComponentAspectData[];
  loading?: boolean;
  selectedBase?: ComponentAspectData;
  selectedCompare?: ComponentAspectData;
  aspectNames: string[];
  selected?: string;
  hook?: ComponentCompareHooksData;
  state?: ComponentCompareStateData;
};

export const ComponentCompareAspectsContext = createContext<ComponentCompareAspectsModel | undefined>(undefined);
export const useAspectCompare: () => ComponentCompareAspectsModel | undefined = () => {
  const componentCompareAspectsContext = useContext(ComponentCompareAspectsContext);
  return componentCompareAspectsContext;
};
