import { LanesAspect } from './lanes.aspect';

export type { CreateLaneResult, LanesMain, Lane, SwitchLaneOptions } from './lanes.main.runtime';
export type { LanesQuery } from '@teambit/lanes.ui.models.lanes-model';
// UI value export removed from this barrel:
//   - LanesModel (was: '@teambit/lanes.ui.models.lanes-model')
// UI callers should import from that package directly.
export type { LanesUI, LaneCompareProps, LaneProviderIgnoreSlot } from './lanes.ui.runtime';
export default LanesAspect;
export { LanesAspect };
