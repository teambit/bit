import { Component, ComponentID } from '@teambit/component';

// TODO - use workspace.list() instead of this
export class RuntimeComponents {
  constructor(public components: Component[] = []) {}
  add(added: Component) {
    this.components = this.components.concat(added);
  }
  remove(removed: ComponentID) {
    this.components = this.components.filter((c) => c.id.toString() !== removed.toString());
  }
  update(next: Component) {
    this.components = this.components.map((c) => (c.equals(next) ? next : c));
  }

  get(id: ComponentID) {
    return this.components.find((x) => x.id.isEqual(id));
  }
}
