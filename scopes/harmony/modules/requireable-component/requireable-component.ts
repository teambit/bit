import { Component } from '@teambit/component';
import { Capsule } from '@teambit/isolator';

type RequireFunc = () => any;

export class RequireableComponent {
  constructor(readonly component: Component, readonly requireFunc: RequireFunc) {}

  async require() {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return this.requireFunc();
  }

  static fromCapsule(capsule: Capsule) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const requireFunc = () => require(capsule.wrkDir);
    return new RequireableComponent(capsule.component, requireFunc);
  }
}
