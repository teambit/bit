// TODO: This 2 (component and capsule should be probably an interfaces in the shared types implemented by the actual classes
import type { Component } from '@teambit/component';
import type { Capsule } from '@teambit/isolator';

export class ResolvedComponent {
  constructor(
    readonly component: Component,
    readonly capsule: Capsule
  ) {}

  require() {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(this.capsule.path);
  }
}
