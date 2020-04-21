import { Component } from '../component';
import { Capsule } from '../isolator/capsule';

export class ResolvedComponent {
  constructor(readonly component: Component, readonly capsule: Capsule) {}

  require() {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(this.capsule.wrkDir);
  }
}
