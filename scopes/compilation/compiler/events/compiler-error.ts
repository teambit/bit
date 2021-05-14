/* eslint-disable max-classes-per-file */
import { BitBaseEvent } from '@teambit/pubsub';

class CompilerErrorEventData {
  constructor(readonly error: any) {}
}

export class CompilerErrorEvent extends BitBaseEvent<CompilerErrorEventData> {
  static readonly TYPE = 'compiler-error';

  constructor(readonly error, readonly timestamp = Date.now()) {
    super(CompilerErrorEvent.TYPE, '0.0.1', timestamp, new CompilerErrorEventData(error));
  }
}
