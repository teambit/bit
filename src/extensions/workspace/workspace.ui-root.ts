import { UIRoot } from '../ui';
import { Component, ComponentID } from '../component';
import { Workspace } from '.';
import { PathOsBased } from '../../utils/path';
import { GetBitMapComponentOptions } from '../../consumer/bit-map/bit-map';

export class WorkspaceUIRoot implements UIRoot {
  constructor(
    /**
     * workspace extension.
     */
    private workspace: Workspace
  ) {}

  name = 'workspace';

  get path() {
    return this.workspace.path;
  }

  get extensionsPaths() {
    // TODO: @gilad please make sure to automate this for all extensions configured in the workspace.
    return [
      require.resolve('../tester/tester.ui'),
      require.resolve('../changelog/changelog.ui'),
      require.resolve('../component/component.ui'),
      require.resolve('../compositions/compositions.ui'),
      require.resolve('../docs/docs.ui'),
    ];
  }

  // TODO: @gilad please implement with variants.
  resolvePattern(pattern: string): Promise<Component[]> {
    return this.workspace.byPattern(pattern);
  }

  /**
   * proxy to `workspace.componentDir()`
   */
  componentDir(
    componentId: ComponentID,
    bitMapOptions?: GetBitMapComponentOptions,
    options = { relative: false }
  ): PathOsBased | undefined {
    return this.workspace.componentDir(componentId, bitMapOptions, options);
  }

  onStart() {}
}
