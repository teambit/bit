// import { ComponentMeta } from '../../../component/component.ui';
import { ComponentID } from '../../../component/id';
import { ComponentStatus } from '../../workspace-component/component-status';
import { DeprecationInfo } from '../../../deprecation/deprecation.extension';
import { Descriptor } from '../../../environments/environments.extension';

export type Component = {
  id: ComponentID;
  status: ComponentStatus;
  deprection: DeprecationInfo;
  env: Descriptor;
};

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
    return new Workspace(
      name,
      path,
      components.map((value) => {
        return {
          id: ComponentID.fromObject(value.id),
          deprection: value.deprection,
          status: value.status,
          env: value.env,
        };
      })
    );
  }
}
