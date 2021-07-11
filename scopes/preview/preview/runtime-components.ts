import { Component, ComponentID } from '@teambit/component';
import type { ExecutionContext } from '@teambit/envs';

// TODO - use workspace.list() instead of this
export class ExecutionRef {
  constructor(public executionCtx: ExecutionContext) {
    this.currentComponents = executionCtx.components;
  }

  currentComponents: Component[];

  // (public components: Component[] = [], public executionCtx: ExecutionContext) {}
  add(added: Component) {
    this.currentComponents = this.currentComponents.concat(added);
  }
  remove(removed: ComponentID) {
    this.currentComponents = this.currentComponents.filter((c) => c.id.toString() !== removed.toString());
  }
  update(next: Component) {
    this.currentComponents = this.currentComponents.map((c) => (c.equals(next) ? next : c));
  }

  get(id: ComponentID) {
    return this.currentComponents.find((x) => x.id.isEqual(id));
  }
}
