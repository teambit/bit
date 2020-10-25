import { Component, ComponentID } from '@teambit/component';

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
}
