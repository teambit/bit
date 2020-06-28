import { Component } from '../../../component/component.ui';

export type WorkspaceProps = {
  name: string;
  path: string;
  components: Component[];
};

export class Workspace {
  constructor(
    /**
     * name of the workspace.
     */
    readonly name: string,

    /**
     * absolute path of the workspace.
     */
    readonly path: string,

    /**
     * components container in the workspace.
     */
    readonly components: Component[]
  ) {}

  static from({ name, path, components }: WorkspaceProps) {
    return new Workspace(name, path, components);
  }
}
