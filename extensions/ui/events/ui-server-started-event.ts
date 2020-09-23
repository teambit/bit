import { BitBaseEvent } from '@teambit/pubsub';

class UiServerStartedEventData {
  constructor(readonly targetHost, readonly targetPort) {}
}

export class UiServerStartedEvent extends BitBaseEvent<UiServerStartedEventData> {
  constructor(readonly timestamp, readonly targetHost, readonly targetPort) {
    super('ui-server-started', '0.0.1', timestamp, new UiServerStartedEventData(targetHost, targetPort));
  }
}
