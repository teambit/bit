/* eslint-disable max-classes-per-file */
import { BitBaseEvent } from '@teambit/pubsub';

export type WebpackCompilationError = {
  message: string;
  stack: string;
};

export type WebpackCompilationWarnings = {
  message: string;
  stack: string;
};

class WebpackCompilationDoneEventData {
  constructor(
    readonly devServerID: string,
    readonly webpackCompilationErrors: WebpackCompilationError[],
    readonly webpackCompilationWarnings: WebpackCompilationWarnings[],
    readonly webpackHash: string
  ) {}
}

export class WebpackCompilationDoneEvent extends BitBaseEvent<WebpackCompilationDoneEventData> {
  static readonly TYPE = 'webpack-compilation-done';

  constructor(
    timestamp: string,
    devServerID: string,
    webpackCompilationErrors: WebpackCompilationError[],
    webpackCompilationWarnings: WebpackCompilationWarnings[],
    webpackHash: string
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
