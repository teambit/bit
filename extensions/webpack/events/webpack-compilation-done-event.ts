import { BitBaseEvent } from '@teambit/pubsub';

class WebpackCompilationDoneEventData {}

export class WebpackCompilationDoneEvent extends BitBaseEvent<WebpackCompilationDoneEventData> {
  constructor(readonly timestamp) {
    super('webpack-compilation-done', '0.0.1', timestamp, new WebpackCompilationDoneEventData());
  }
}
