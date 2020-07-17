// import { ComponentMeta } from '../../../component/component.ui';
import { ComponentID } from '../../../component/id';

export type WorkspaceProps = {
  name: string;
  path: string;
  components: any[];
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
    readonly components: ComponentID[]
  ) {}

  static from({ name, path, components }: WorkspaceProps) {
    return new Workspace(
      name,
      path,
      components.map((value) => ComponentID.fromObject(value.id))
    );
  }
}
