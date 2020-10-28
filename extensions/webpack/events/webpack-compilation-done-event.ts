/* eslint-disable max-classes-per-file */
import { BitBaseEvent } from '@teambit/pubsub';

class WebpackCompilationDoneEventData {
  constructor(readonly stats, readonly devServerID) {}
}

export class WebpackCompilationDoneEvent extends BitBaseEvent<WebpackCompilationDoneEventData> {
  static readonly TYPE = 'webpack-compilation-done';

  constructor(readonly timestamp, readonly stats, readonly devServerID) {
    super(
      WebpackCompilationDoneEvent.TYPE,
      '0.0.1',
      timestamp,
      new WebpackCompilationDoneEventData(stats, devServerID)
    );
  }
}
