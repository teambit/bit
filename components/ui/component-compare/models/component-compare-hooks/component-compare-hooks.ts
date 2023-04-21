import { ComponentCompareStateKey } from '@teambit/component.ui.component-compare.models.component-compare-state';
import { useUpdatedUrlFromQuery } from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';

export type ComponentCompareHooksData = {
  onClick?: (id?: string, _?: React.MouseEvent<Element>) => void;
  useUpdatedUrlFromQuery?: typeof useUpdatedUrlFromQuery;
};

export type ComponentCompareHooks<
  K extends ComponentCompareStateKey = ComponentCompareStateKey,
  V extends ComponentCompareHooksData = ComponentCompareHooksData
> = Partial<Record<K, V>>;
