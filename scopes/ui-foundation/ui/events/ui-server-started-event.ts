/* eslint-disable max-classes-per-file */
import { BitBaseEvent } from '@teambit/pubsub';

import type ConsumerComponent from 'bit-bin/dist/consumer/component';
import { DevServer, MainUIServerDetails } from '../start-cmd/cli-output';

class UiServerStartedEventData {
  constructor(
    readonly mainUIServer: MainUIServerDetails,
    readonly devServers: Array<DevServer>,
    readonly componentList: Array<ConsumerComponent>,
    readonly isScope: boolean
  ) {}
}

export class UiServerStartedEvent extends BitBaseEvent<UiServerStartedEventData> {
  static readonly TYPE = 'ui-server-started';

  constructor(
    readonly timestamp: string,
    readonly uiRootName: string,
    readonly targetHost: string,
    readonly targetPort: number,
    readonly componentList: Array<ConsumerComponent>,
    readonly devServers: Array<DevServer>,
    readonly isScope: boolean
  ) {
    super(
      UiServerStartedEvent.TYPE,
      '0.0.1',
      timestamp,
      new UiServerStartedEventData({ uiRootName, isScope, targetHost, targetPort }, devServers, componentList, isScope)
    );
  }
}
