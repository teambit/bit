import { Component } from '../component';
import { ComponentCapsule } from '../../capsule-ext';

export class ResolvedComponent {
  constructor(readonly component: Component, readonly capsule: ComponentCapsule) {}

  require() {
    return require(this.capsule.wrkDir);
  }
}
