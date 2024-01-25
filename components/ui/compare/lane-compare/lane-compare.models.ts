import { ChangeType } from '@teambit/lanes.entities.lane-diff';
import {
  ComponentCompareStateData,
  ComponentCompareStateKey,
} from '@teambit/component.ui.component-compare.models.component-compare-state';
import { ComponentCompareProps } from '@teambit/component.ui.component-compare.models.component-compare-props';
import { LaneModel } from '@teambit/lanes.ui.models.lanes-model';

export type DefaultLaneState = (
  compId?: string
) => Partial<Record<ComponentCompareStateKey, ComponentCompareStateData>>;
export type LaneFilterType = ChangeType | 'ALL';
export const ChangeTypeGroupOrder = [
  ChangeType.NEW,
  ChangeType.SOURCE_CODE,
  ChangeType.ASPECTS,
  ChangeType.DEPENDENCY,
  ChangeType.NONE,
];

export type DrawerWidgetProps = {
  drawerProps: {
    isOpen: boolean;
  };
  compareProps: ComponentCompareProps;
  isFullScreen?: boolean;
  base: LaneModel;
  compare: LaneModel;
};

export type LaneFilter = {
  type: string;
  values: string[];
};
