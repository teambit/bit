import { Component } from '../../../extensions/component';
import { Capsule } from '../../../extensions/isolator';

type RequireFunc = () => any;

export class RequireableComponent {
  constructor(readonly component: Component, readonly requireFunc: RequireFunc) {}

  require() {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return this.requireFunc();
  }

  static fromCapsule(capsule: Capsule) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const requireFunc = () => require(capsule.wrkDir);
    return new RequireableComponent(capsule.component, requireFunc);
  }
}
