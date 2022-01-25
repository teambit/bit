import { ComponentModel } from '@teambit/component';
import { LaneViewModel } from '@teambit/lanes.lanes.ui';

export class ScopePayload {
  get isScope() {
    return true;
  }
}

export type PayloadType = ComponentModel | ScopePayload | undefined | LaneViewModel;
