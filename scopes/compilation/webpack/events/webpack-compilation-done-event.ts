/* eslint-disable max-classes-per-file */
import { BitBaseEvent } from '@teambit/pubsub';

class WebpackCompilationDoneEventData {
  // constructor(readonly stats, readonly devServerID) {}
  constructor(
    readonly devServerID: string,
    readonly webpackCompilationErrors: string[],
    readonly webpackCompilationWarnings: string[],
    readonly webpackHash: string[]
  ) {}
}

export class WebpackCompilationDoneEvent extends BitBaseEvent<WebpackCompilationDoneEventData> {
  static readonly TYPE = 'webpack-compilation-done';

  // constructor(timestamp, stats, devServerID) {
  constructor(
    timestamp: string,
    devServerID: string,
    webpackCompilationErrors: string[],
    webpackCompilationWarnings: string[],
    webpackHash: string[]
  ) {
    super(
      WebpackCompilationDoneEvent.TYPE,
      '0.0.1',
      timestamp,
      new WebpackCompilationDoneEventData(
        devServerID,
        webpackCompilationErrors,
        webpackCompilationWarnings,
        webpackHash
      )
    );
  }
}
