import type { ComponentCompareModel } from '@teambit/component.ui.component-compare.models.component-compare-model';
import type { ComponentCompareState } from '@teambit/component.ui.component-compare.models.component-compare-state';
import type { ComponentCompareHooks } from '@teambit/component.ui.component-compare.models.component-compare-hooks';
import type { APIDiffResult } from '@teambit/semantics.ui.api-diff-view';
import { createContext, useContext } from 'react';

export type StateAndHooks = {
  state?: ComponentCompareState;
  hooks?: ComponentCompareHooks;
};

export type ViewState = {
  isFullScreen?: boolean;
  hidden?: boolean;
};
export type ComponentCompareContextType = ComponentCompareModel &
  StateAndHooks & {
    baseContext?: StateAndHooks;
    compareContext?: StateAndHooks;
    /** API diff between base and compare — undefined while loading, null when not computable */
    apiDiffResult?: APIDiffResult | null;
  } & ViewState;

export const ComponentCompareContext: React.Context<ComponentCompareContextType | undefined> = createContext<
  ComponentCompareContextType | undefined
>(undefined);

export const useComponentCompare: () => ComponentCompareContextType | undefined = () => {
  const componentCompareContext = useContext(ComponentCompareContext);
  return componentCompareContext;
};
