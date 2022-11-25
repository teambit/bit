import { ComponentID } from '@teambit/component-id';
import { ComponentCompareState } from '@teambit/component.ui.component-compare.models.component-compare-state';

export type LaneCompareState = Map<string, ComponentCompareState>;
export const defaultState: LaneCompareState = new Map<string, ComponentCompareState>();
export const computeStateKey = (base: ComponentID, compare: ComponentID) => `${base.toString()}-${compare.toString()}`;
