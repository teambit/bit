// import { ComponentMeta } from '@teambit/component';
import { ComponentID, ComponentModel, ComponentModelProps } from '@teambit/component';
import { DeprecationInfo } from '@teambit/deprecation';
import { Descriptor } from '@teambit/envs';

import { ComponentStatus } from '../../workspace-component/component-status';

export type WorkspaceModelComponent = {
  id: ComponentID;
  status: ComponentStatus;
  deprecation: DeprecationInfo;
  env: Descriptor;
};

export type WorkspaceProps = {
  name: string;
  path: string;
  components: ComponentModelProps[];
  icon: string;
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
     * icon of the workspace.
     */
    readonly icon: string,

    /**
     * components container in the workspace.
     */
    readonly components: ComponentModel[]
  ) {}

  /**
   * return a component from the workspace.
   */
  getComponent(id: ComponentID) {
    return this.components.find((component) => component.id.fullName === id.fullName);
  }

  static from({ name, path, components, icon }: WorkspaceProps) {
    return new Workspace(
      name,
      path,
      icon,
      components.map((value) => {
        return ComponentModel.from(value);
      })
    );
  }

  static empty() {
    return new Workspace('', '', '', []);
  }
}
