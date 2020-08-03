// import { ComponentMeta } from '../../../component/component.ui';
import { ComponentID } from '../../../component/id';
import { ComponentStatus } from '../../workspace-component/component-status';
import { DeprecationInfo } from '../../../deprecation/deprecation.extension';
import { Descriptor } from '../../../environments/environments.extension';
import { ComponentModel } from '../../../component/ui';
import { ComponentModelProps } from '../../../component/ui/component-model/component-model';

export type Component = {
  id: ComponentID;
  status: ComponentStatus;
  deprection: DeprecationInfo;
  env: Descriptor;
};

export type WorkspaceProps = {
  name: string;
  path: string;
  components: ComponentModelProps[];
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
    readonly components: ComponentModel[]
  ) {}

  static from({ name, path, components }: WorkspaceProps) {
    return new Workspace(
      name,
      path,
      components.map((value) => {
        return ComponentModel.from(value);
      })
    );
  }

  static empty() {
    return new Workspace('', '', []);
  }
}
