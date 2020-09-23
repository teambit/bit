import { BitBaseEvent } from '@teambit/pubsub';

export type UiServerStartedEvent = BitBaseEvent & {
  readonly type: 'ui-server-started';
  readonly version: '0.0.1';
  readonly timestamp: string;
  readonly body: {
    targetHost: string;
    targetPort: number;
  };
};
