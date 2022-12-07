import { ComponentCompareHooksData } from '@teambit/component.ui.component-compare.models.component-compare-hooks';
import { ComponentCompareStateData } from '@teambit/component.ui.component-compare.models.component-compare-state';

export type ComponentAspectData = {
  icon?: string;
  name?: string;
  config: any;
  data: any;
  aspectId: string;
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
