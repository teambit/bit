/* eslint-disable max-classes-per-file */
import { BitBaseEvent } from '@teambit/pubsub';

class OnComponentChangeEventData {
  constructor(readonly idStr, readonly hook) {}
}

export class OnComponentChangeEvent extends BitBaseEvent<OnComponentChangeEventData> {
  static readonly TYPE = 'on-component-change';

  constructor(readonly timestamp, readonly idStr, readonly hook) {
    super(OnComponentChangeEvent.TYPE, '0.0.1', timestamp, new OnComponentChangeEventData(idStr, hook));
  }
}
