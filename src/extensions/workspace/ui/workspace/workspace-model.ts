import { ComponentModel } from '../../../component/ui';
import { ComponentModelProps } from '../../../component/ui/component-model/component-model';

export type WorkspaceProps = {
  name?: string;
  path?: string;
  components?: ComponentModelProps[];
};

export class WorkspaceModel {
  constructor(
    /**
     * name of the workspace.
     */
    readonly name?: string,

    /**
     * absolute path of the workspace.
     */
    readonly path?: string,

    /**
     * components container in the workspace.
     */
    readonly components?: ComponentModel[]
  ) {}

  static from({ name, path, components }: WorkspaceProps) {
    return new WorkspaceModel(
      name,
      path,
      components?.map(x => ComponentModel.from(x))
    );
  }
}
