/* eslint-disable max-classes-per-file */
import { BitBaseEvent } from '@teambit/pubsub';

class OnComponentAddEventData {
  constructor(readonly idStr, readonly hook) {}
}

export class OnComponentAddEvent extends BitBaseEvent<OnComponentAddEventData> {
  static readonly TYPE = 'on-component-add';

  constructor(readonly timestamp, readonly idStr, readonly hook) {
    super(OnComponentAddEvent.TYPE, '0.0.1', timestamp, new OnComponentAddEventData(idStr, hook));
  }
}
