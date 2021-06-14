/* eslint-disable max-classes-per-file */

import { BitBaseEvent } from '@teambit/pubsub';

class EnvsServerStartedEventData {
  constructor(readonly EnvsServer, readonly context, readonly hostname, readonly port) {}
}

export class EnvsServerStartedEvent extends BitBaseEvent<EnvsServerStartedEventData> {
  static readonly TYPE = 'components-server-started';

  constructor(readonly timestamp, readonly envsServer, readonly context, readonly hostname, readonly port) {
    super(
      EnvsServerStartedEvent.TYPE,
      '0.0.1',
      timestamp,
      new EnvsServerStartedEventData(envsServer, context, hostname, port)
    );
  }
}
