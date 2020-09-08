import { bitBaseEvent } from '../../../custom-types';

export type uiServerStartedEvent = bitBaseEvent & {
  readonly type: 'ui-server-started';
  readonly version: '0.0.0.1';
  readonly timestamp: string;
  readonly body: {
    props: string;
  };
};
