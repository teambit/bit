/* eslint-disable max-classes-per-file */
import { BitBaseEvent } from '@teambit/pubsub';

export class WebpackCompilationStartedEventData {
  constructor(readonly params: object) {}
}

export class WebpackCompilationStartedEvent extends BitBaseEvent<WebpackCompilationStartedEventData> {
  static readonly TYPE = 'webpack-compilation-started';

  constructor(readonly timestamp, readonly params: object) {
    super(WebpackCompilationStartedEvent.TYPE, '0.0.1', timestamp, new WebpackCompilationStartedEventData(params));
  }
}
