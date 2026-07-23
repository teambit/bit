import { ChangeType } from '@teambit/lanes.entities.lane-diff';
import type {
  ComponentCompareStateData,
  ComponentCompareStateKey,
} from '@teambit/component.ui.component-compare.models.component-compare-state';

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

export type LaneFilter = {
  type: string;
  values: string[];
};
