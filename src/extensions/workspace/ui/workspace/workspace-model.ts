import { Component } from '../../../component/component.ui';

export class Workspace {
  constructor(readonly path: string, readonly components: Component[]) {}

  static from({ path, components }: { path: string; components: Component[] }) {
    return new Workspace(path, components);
  }
}
