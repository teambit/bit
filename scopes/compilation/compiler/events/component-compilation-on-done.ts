/* eslint-disable max-classes-per-file */
import { BitBaseEvent } from '@teambit/pubsub';
import { Component } from '@teambit/component';
import { CompileError } from '../workspace-compiler';

class ComponentCompilationOnDoneEventData {
  constructor(readonly errors: Array<CompileError>, readonly component: Component, readonly buildResults: string[]) {}
}

export class ComponentCompilationOnDoneEvent extends BitBaseEvent<ComponentCompilationOnDoneEventData> {
  static readonly TYPE = 'component-compilation-on-done';

  constructor(
    readonly errors: Array<CompileError>,
    readonly component: Component,
    readonly buildResults: string[],
    readonly timestamp = Date.now()
  ) {
    super(
      ComponentCompilationOnDoneEvent.TYPE,
      '0.0.1',
      timestamp,
      new ComponentCompilationOnDoneEventData(errors, component, buildResults)
    );
  }
}
