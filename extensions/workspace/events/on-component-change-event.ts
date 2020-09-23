import { BitBaseEvent } from '@teambit/pubsub';

class OnComponentChangeEventData {
  constructor(readonly idStr, readonly hook) {}
}

export class OnComponentChangeEvent extends BitBaseEvent<OnComponentChangeEventData> {
  constructor(readonly timestamp, readonly idStr, readonly hook) {
    super('on-component-change', '0.0.1', timestamp, new OnComponentChangeEventData(idStr, hook));
  }
}
