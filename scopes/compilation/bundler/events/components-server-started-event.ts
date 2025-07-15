/* eslint-disable max-classes-per-file */

import { GraphqlMain } from '@teambit/graphql';
import { BitBaseEvent } from '@teambit/pubsub';
import { ComponentServer } from '../component-server';
import { ExecutionContext } from '@teambit/envs';

export const ComponentServerStartedEvent = 'ComponentServerStartedEvent';

class ComponentsServerStartedEventData {
  constructor(
    readonly componentsServer: ComponentServer,
    readonly context: ExecutionContext,
    readonly hostname?: string,
    readonly port?: number
  ) {}
}

export class ComponentsServerStartedEvent extends BitBaseEvent<ComponentsServerStartedEventData> {
  static readonly TYPE = 'components-server-started';

  constructor(
    readonly timestamp: number,
    readonly componentsServer: ComponentServer,
    readonly context: ExecutionContext,
    readonly hostname?: string,
    readonly port?: number
  ) {
    super(
      ComponentsServerStartedEvent.TYPE,
      '0.0.1',
      timestamp,
      new ComponentsServerStartedEventData(componentsServer, context, hostname, port)
    );
  }
}

export class NewDevServersCreatedEvent extends BitBaseEvent<ComponentsServerStartedEventData[]> {
  static readonly TYPE = 'new-dev-servers-created';

  constructor(
    readonly componentsServers: ComponentServer[],
    readonly timestamp: number,
    readonly graphql: GraphqlMain,
    readonly restartIfRunning: boolean = false
  ) {
    super(
      NewDevServersCreatedEvent.TYPE,
      '0.0.1',
      timestamp,
      componentsServers.map((c) => new ComponentsServerStartedEventData(c, c.context, c.hostname, c.port))
    );
  }
}
