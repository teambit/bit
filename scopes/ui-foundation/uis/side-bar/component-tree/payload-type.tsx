import { ComponentModel } from '@teambit/component';
import { LaneModel } from '@teambit/lanes.lanes.ui';

export class ScopePayload {
  get isScope() {
    return true;
  }
}

export type PayloadType = ComponentModel | ScopePayload | undefined | LaneModel;
