import { BundlerMain } from '@teambit/bundler';
import { Component, ComponentID, ResolveAspectsOptions } from '@teambit/component';
import { UIRoot } from '@teambit/ui';
import { GetBitMapComponentOptions } from '@teambit/legacy/dist/consumer/bit-map/bit-map';
import { PathOsBased } from '@teambit/legacy/dist/utils/path';

import { Workspace } from './workspace';

export class WorkspaceUIRoot implements UIRoot {
  constructor(
    /**
     * workspace extension.
     */
    private workspace: Workspace,

    /**
     * bundler extension
     */
    private bundler: BundlerMain
  ) {}

  priority = true;

  get name() {
    return this.workspace.name;
  }

  get path() {
    return this.workspace.path;
  }

  get configFile() {
    return 'workspace.json';
  }

  buildOptions = {
    ssr: false,
    launchBrowserOnStart: true,
  };

  async resolveAspects(runtimeName: string, componentIds?: ComponentID[], opts?: ResolveAspectsOptions) {
    return this.workspace.resolveAspects(runtimeName, componentIds, opts);
  }

  // TODO: @gilad please implement with variants.
  resolvePattern(pattern: string): Promise<Component[]> {
    return this.workspace.byPattern(pattern);
  }

  getConfig() {
    return {};
  }

  /**
   * proxy to `workspace.componentDir()`
   */
  componentDir(
    componentId: ComponentID,
    bitMapOptions?: GetBitMapComponentOptions,
    options = { relative: false }
  ): PathOsBased {
    return this.workspace.componentDir(componentId, bitMapOptions, options);
  }
}
