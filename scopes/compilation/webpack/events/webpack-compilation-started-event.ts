/* eslint-disable max-classes-per-file */
import { BitBaseEvent } from '@teambit/pubsub';

class WebpackCompilationStartedEventData {
  constructor(readonly context: string, readonly entry: string[]) {}
}

export class WebpackCompilationStartedEvent extends BitBaseEvent<WebpackCompilationStartedEventData> {
  static readonly TYPE = 'webpack-compilation-started';

  constructor(readonly timestamp, readonly context: string, readonly entry: string[]) {
    super(
      WebpackCompilationStartedEvent.TYPE,
      '0.0.1',
      timestamp,
      new WebpackCompilationStartedEventData(context, entry)
    );
  }
}
