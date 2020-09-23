import { BitBaseEvent } from '@teambit/pubsub';

export type OnComponentChange = BitBaseEvent & {
  readonly type: 'on-component-change';
  readonly version: '0.0.1';
  readonly timestamp: string;
  readonly body: {
    idStr;
    hook;
  };
};
