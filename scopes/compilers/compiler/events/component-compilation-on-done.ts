/* eslint-disable max-classes-per-file */
import { BitBaseEvent } from '@teambit/pubsub';

class ComponentCompilationOnDoneEventData {
  constructor(readonly errors: Array<any>, readonly component: any, readonly buildResults: Array<any>) {}
}

export class ComponentCompilationOnDoneEvent extends BitBaseEvent<ComponentCompilationOnDoneEventData> {
  static readonly TYPE = 'component-compilation-on-done';

  constructor(readonly errors, readonly component, readonly buildResults, readonly timestamp = Date.now().toString()) {
    super(
      ComponentCompilationOnDoneEvent.TYPE,
      '0.0.1',
      timestamp,
      new ComponentCompilationOnDoneEventData(errors, component, buildResults)
    );
  }
}
