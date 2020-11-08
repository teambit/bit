/* eslint-disable max-classes-per-file */

import { BitBaseEvent } from '@teambit/pubsub';

class ComponentsServerStartedEventData {
  constructor(readonly id: string, readonly name: string, readonly targetHost: string, readonly targetPort: number) {}
}

export class ComponentsServerStartedEvent extends BitBaseEvent<ComponentsServerStartedEventData> {
  static readonly TYPE = 'components-server-started';

  constructor(timestamp: string, id: string, name: string, targetHost: string, targetPort: number) {
    super(
      ComponentsServerStartedEvent.TYPE,
      '0.0.1',
      timestamp,
      new ComponentsServerStartedEventData(id, name, targetHost, targetPort)
    );
  }
}
