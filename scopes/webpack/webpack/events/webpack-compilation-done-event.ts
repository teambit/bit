/* eslint-disable max-classes-per-file */
import type { Stats } from 'webpack';
import { BitBaseEvent } from '@teambit/pubsub';

class WebpackCompilationDoneEventData {
  constructor(readonly stats: Stats, readonly devServerID: string) {}
}

export class WebpackCompilationDoneEvent extends BitBaseEvent<WebpackCompilationDoneEventData> {
  static readonly TYPE = 'webpack-compilation-done';

  constructor(readonly timestamp: number, readonly stats: Stats, readonly devServerID: string) {
    super(
      WebpackCompilationDoneEvent.TYPE,
      '0.0.1',
      timestamp,
      new WebpackCompilationDoneEventData(stats, devServerID)
    );
  }
}
