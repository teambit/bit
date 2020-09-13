import { BitBaseEvent } from '@teambit/pubsub';

export type StartFinishedEvent = BitBaseEvent & {
  readonly type: 'start-finished';
  readonly version: '0.0.1';
  readonly timestamp: string;
  readonly body: {
    props: string;
  };
};
