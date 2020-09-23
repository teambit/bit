import { BitBaseEvent } from '@teambit/pubsub';

class ComponentsServerStartedEventData {
  constructor(readonly componentsServer, readonly executionContext, readonly hostname, readonly port) {}
}

export class ComponentsServerStartedEvent extends BitBaseEvent<ComponentsServerStartedEventData> {
  constructor(
    readonly timestamp,
    readonly componentsServer,
    readonly executionContext,
    readonly hostname,
    readonly port
  ) {
    super(
      'ui-server-started',
      '0.0.1',
      timestamp,
      new ComponentsServerStartedEventData(componentsServer, executionContext, hostname, port)
    );
  }
}
