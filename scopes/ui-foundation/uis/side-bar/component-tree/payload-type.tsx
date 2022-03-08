import { ComponentModel } from '@teambit/component';
import { LaneModel } from '@teambit/lanes.ui.lanes';

export class ScopePayload {
  get isScope() {
    return true;
  }
}

export type PayloadType = ComponentModel | ScopePayload | LaneModel | undefined;
