/* eslint-disable max-classes-per-file */
import { BitBaseEvent } from '@teambit/pubsub';
import { BuildResult, CompileError } from '../workspace-compiler';

import type ConsumerComponent from 'bit-bin/dist/consumer/component';

class ComponentCompilationOnDoneEventData {
  constructor(
    readonly errors: Array<CompileError>,
    readonly component: ConsumerComponent,
    readonly buildResults: Array<BuildResult>
  ) {}
}

export class ComponentCompilationOnDoneEvent extends BitBaseEvent<ComponentCompilationOnDoneEventData> {
  static readonly TYPE = 'component-compilation-on-done';

  constructor(
    readonly errors: Array<CompileError>,
    readonly component: ConsumerComponent,
    readonly buildResults: Array<BuildResult>,
    readonly timestamp = Date.now().toString()
  ) {
    super(
      ComponentCompilationOnDoneEvent.TYPE,
      '0.0.1',
      timestamp,
      new ComponentCompilationOnDoneEventData(errors, component, buildResults)
    );
  }
}
