import { ComponentCompareModel } from '@teambit/component.ui.component-compare.models.component-compare-model';
import { ComponentCompareState } from '@teambit/component.ui.component-compare.models.component-compare-state';
import { ComponentCompareHooks } from '@teambit/component.ui.component-compare.models.component-compare-hooks';
import { createContext, useContext } from 'react';

export type StateAndHooks = {
  state?: ComponentCompareState;
  hooks?: ComponentCompareHooks;
};

export type ComponentCompareContextType = ComponentCompareModel &
  StateAndHooks & {
    baseContext?: StateAndHooks;
    compareContext?: StateAndHooks;
  } & {
    isFullScreen?: boolean;
    hidden?: boolean;
  };

export const ComponentCompareContext = createContext<ComponentCompareContextType | undefined>(undefined);

export const useComponentCompare: () => ComponentCompareContextType | undefined = () => {
  const componentCompareContext = useContext(ComponentCompareContext);
  return componentCompareContext;
};
