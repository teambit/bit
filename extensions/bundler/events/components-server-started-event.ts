/* eslint-disable max-classes-per-file */

import { BitBaseEvent } from '@teambit/pubsub';

class ComponentsServerStartedEventData {
  constructor(readonly componentsServer, readonly executionContext, readonly hostname, readonly port) {}
}

export class ComponentsServerStartedEvent extends BitBaseEvent<ComponentsServerStartedEventData> {
  static readonly TYPE = 'components-server-started';

  constructor(
    readonly timestamp,
    readonly componentsServer,
    readonly executionContext,
    readonly hostname,
    readonly port
  ) {
    super(
      ComponentsServerStartedEvent.TYPE,
      '0.0.1',
      timestamp,
      new ComponentsServerStartedEventData(componentsServer, executionContext, hostname, port)
    );
  }
}
