/* eslint-disable max-classes-per-file */

import { GraphqlMain } from '@teambit/graphql';
import { BitBaseEvent } from '@teambit/pubsub';

export const ComponentServerStartedEvent = 'ComponentServerStartedEvent';

class ComponentsServerStartedEventData {
  constructor(
    readonly componentsServer,
    readonly context,
    readonly hostname,
    readonly port
  ) {}
}

export class ComponentsServerStartedEvent extends BitBaseEvent<ComponentsServerStartedEventData> {
  static readonly TYPE = 'components-server-started';

  constructor(
    readonly timestamp,
    readonly componentsServer,
    readonly context,
    readonly hostname,
    readonly port
  ) {
    super(
      ComponentsServerStartedEvent.TYPE,
      '0.0.1',
      timestamp,
      new ComponentsServerStartedEventData(componentsServer, context, hostname, port)
    );
  }
}

export class NewDevServerCreatedEvent extends BitBaseEvent<ComponentsServerStartedEventData> {
  static readonly TYPE = 'new-dev-server-created';

  constructor(
    readonly timestamp,
    readonly componentsServer,
    readonly context,
    readonly hostname,
    readonly port,
    readonly graphql: GraphqlMain,
    readonly restartIfRunning: boolean = false
  ) {
    super(
      ComponentsServerStartedEvent.TYPE,
      '0.0.1',
      timestamp,
      new ComponentsServerStartedEventData(componentsServer, context, hostname, port)
    );
  }

  async publishGraphqlEvent() {
    await this.graphql.pubsub.publish(ComponentServerStartedEvent, {
      componentsServer: this.componentsServer,
      context: this.context,
      hostname: this.hostname,
      port: this.port
    });
  }
}

