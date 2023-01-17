import { ComponentCompareHooksData } from '@teambit/component.ui.component-compare.models.component-compare-hooks';
import { ComponentCompareStateData } from '@teambit/component.ui.component-compare.models.component-compare-state';

export type ComponentAspectData = {
  id: string;
  icon?: string;
  name?: string;
  config: any;
  data: any;
};

export type ComponentCompareAspectsModel = {
  base: ComponentAspectData[];
  compare: ComponentAspectData[];
  loading?: boolean;
  selectedBase?: ComponentAspectData;
  selectedCompare?: ComponentAspectData;
  selected?: string;
  aspectNames: string[];
  hook?: ComponentCompareHooksData;
  state?: ComponentCompareStateData;
};
