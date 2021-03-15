/* eslint-disable max-classes-per-file */
import { BitBaseEvent } from '@teambit/pubsub';

class ClickInsideAnIframeEventData {
  constructor(private clickEvent: any) {}
}

export class ClickInsideAnIframeEvent extends BitBaseEvent<ClickInsideAnIframeEventData> {
  static readonly TYPE = 'click-inside-an-iframe';

  constructor(readonly timestamp = Date.now(), readonly clickEvent) {
    super(ClickInsideAnIframeEvent.TYPE, '0.0.1', timestamp, new ClickInsideAnIframeEventData(clickEvent));
  }
}
