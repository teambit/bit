import { Component } from '@teambit/component';

export class AspectDefinition {
  constructor(readonly component: Component, readonly aspectPath: string, readonly runtimePath: string) {}
}
