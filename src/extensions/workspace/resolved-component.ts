import { Component } from '../component';
import { ComponentCapsule } from '../capsule/component-capsule';

export class ResolvedComponent {
  constructor(readonly component: Component, readonly capsule: ComponentCapsule) {}

  require() {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(this.capsule.wrkDir);
  }
}
