/* eslint-disable max-classes-per-file */
import { BitBaseEvent } from '@teambit/pubsub';

class UiServerStartedEventData {
  constructor(readonly targetHost, readonly targetPort, readonly uiRoot) {}
}

export class UiServerStartedEvent extends BitBaseEvent<UiServerStartedEventData> {
  static readonly TYPE = 'ui-server-started';

  constructor(readonly timestamp, readonly targetHost, readonly targetPort, readonly uiRoot) {
    super(UiServerStartedEvent.TYPE, '0.0.1', timestamp, new UiServerStartedEventData(targetHost, targetPort, uiRoot));
  }
}
