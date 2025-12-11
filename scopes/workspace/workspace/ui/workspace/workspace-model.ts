// import { ComponentMeta } from '@teambit/component';
import type { ComponentModelProps } from '@teambit/component';
import { ComponentID, ComponentModel } from '@teambit/component';
import { ComponentDescriptor } from '@teambit/component-descriptor';
import type { DeprecationInfo } from '@teambit/deprecation';
import type { Descriptor } from '@teambit/envs';

import type { ComponentStatus } from '../../workspace-component/component-status';

export type WorkspaceModelComponent = {
  id: ComponentID;
  status: ComponentStatus;
  deprecation: DeprecationInfo;
  env: Descriptor;
};

export type WorkspaceProps = {
  name: string;
  path: string;
  components: (ComponentModelProps & { aspects: Record<string, any> })[];
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
    readonly components: ComponentModel[],

    /**
     * components contained in the workspace.
     */
    readonly componentDescriptors: ComponentDescriptor[]
  ) {}

  /**
   * return a component from the workspace.
   */
  getComponent(id: ComponentID) {
    return this.components.find((component) => component.id.fullName === id.fullName);
  }

  static from({ name, path, components, icon }: WorkspaceProps) {
    const componentDescriptors = components.map((component) => {
      const id = ComponentID.fromObject(component.id);
      const aspectList = {
        entries: component?.aspects.map((aspectObject) => {
          return {
            ...aspectObject,
            aspectId: aspectObject.aspectId,
            aspectData: aspectObject.data,
          };
        }),
      };
      return ComponentDescriptor.fromObject({ id: id.toString(), aspectList });
    });
    return new Workspace(
      name,
      path,
      icon,
      components.map((value) => {
        return ComponentModel.from(value);
      }),
      componentDescriptors
    );
  }

  static empty() {
    return new Workspace('', '', '', [], []);
  }
}
