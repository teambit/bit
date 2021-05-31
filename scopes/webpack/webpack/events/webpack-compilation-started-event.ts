/* eslint-disable max-classes-per-file */
import { BitBaseEvent } from '@teambit/pubsub';

type Params = {
  devServerID: string;
};

export class WebpackCompilationStartedEvent extends BitBaseEvent<Params> {
  static readonly TYPE = 'webpack-compilation-started';

  constructor(readonly timestamp, readonly params: Params) {
    super(WebpackCompilationStartedEvent.TYPE, '0.0.1', timestamp, params);
  }
}
