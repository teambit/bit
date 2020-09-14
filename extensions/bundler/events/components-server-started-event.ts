import { BitBaseEvent } from '@teambit/pubsub';

export type ComponentsServerStartedEvent = BitBaseEvent & {
  readonly type: 'components-server-started';
  readonly version: '0.0.1';
  readonly timestamp: string;
  readonly body: {
    componentsServer;
    executionContext;
    hostname;
    port;
  };
};
