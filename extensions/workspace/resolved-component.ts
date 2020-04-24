import { Component } from '@bit/bit.core.component';
import { Capsule } from '@bit/bit.core.isolator/capsule';

export class ResolvedComponent {
  constructor(readonly component: Component, readonly capsule: Capsule) {}

  require() {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(this.capsule.wrkDir);
  }
}
