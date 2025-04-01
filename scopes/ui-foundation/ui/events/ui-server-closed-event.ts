/* eslint-disable max-classes-per-file */
import { BitBaseEvent } from '@teambit/pubsub';

class UiServerClosedEventData {
}

export class UiServerClosedEvent extends BitBaseEvent<UiServerClosedEventData> {
    static readonly TYPE = 'ui-server-closed';

    constructor(
        readonly timestamp,
    ) {
        super(UiServerClosedEvent.TYPE, '0.0.1', timestamp, new UiServerClosedEventData());
    }
}
