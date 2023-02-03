import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import WorkspaceAspect, { OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { PathOsBasedRelative } from '@teambit/legacy/dist/utils/path';
import { AddCmd } from './add-cmd';
import AddComponents, { AddActionResults, AddContext, AddProps, Warnings } from './add-components';
import { TrackerAspect } from './tracker.aspect';

export type TrackResult = { componentName: string; files: string[]; warnings: Warnings };

export type TrackData = {
  rootDir: PathOsBasedRelative; // path relative to the workspace
  componentName?: string; // if empty, it'll be generated from the path
  mainFile?: string; // if empty, attempts will be made to guess the best candidate
  defaultScope?: string; // can be entered as part of "bit create" command, helpful for out-of-sync logic
  config?: { [aspectName: string]: any }; // config specific to this component, which overrides variants of workspace.jsonc
};

export class TrackerMain {
  constructor(private workspace: Workspace) {}
  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect];
  static runtime = MainRuntime;

  /**
   * add a new component to the .bitmap file.
   * this method only adds the records in memory but doesn't persist to the filesystem.
   * to write the .bitmap file once completed, run "await this.bitMap.write();"
   */
  async track(trackData: TrackData): Promise<TrackResult> {
    const defaultScope = trackData.defaultScope ? await this.addOwnerToScopeName(trackData.defaultScope) : undefined;
    const addComponent = new AddComponents(
      { workspace: this.workspace },
      {
        componentPaths: [trackData.rootDir],
        id: trackData.componentName,
        main: trackData.mainFile,
        override: false,
        defaultScope,
        config: trackData.config,
      }
    );
    const result = await addComponent.add();
    const addedComponent = result.addedComponents[0];
    const componentName = addedComponent?.id.name || (trackData.componentName as string);
    const files = addedComponent?.files.map((f) => f.relativePath) || [];
    return { componentName, files, warnings: result.warnings };
  }

  async addForCLI(addProps: AddProps): Promise<AddActionResults> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const addContext: AddContext = { workspace: this.workspace };
    addProps.shouldHandleOutOfSync = true;
    const addComponents = new AddComponents(addContext, addProps);
    const addResults = await addComponents.add();
    await this.workspace.consumer.onDestroy();

    return addResults;
  }

  /**
   * scopes in bit.dev are "owner.collection".
   * we might have the scope-name only without the owner and we need to retrieve it from the defaultScope in the
   * workspace.jsonc file.
   *
   * @param scopeName scopeName that might not have the owner part.
   * @returns full scope name
   */
  private async addOwnerToScopeName(scopeName: string): Promise<string> {
    if (scopeName.includes('.')) return scopeName; // it has owner.
    const isSelfHosted = !(await this.isHostedByBit(scopeName));
    if (isSelfHosted) return scopeName;
    const wsDefaultScope = this.workspace.defaultScope;
    if (!wsDefaultScope.includes('.')) {
      throw new Error(`the entered scope has no owner nor the defaultScope in workspace.jsonc`);
    }
    const [owner] = wsDefaultScope.split('.');
    return `${owner}.${scopeName}`;
  }

  /**
   * whether a scope is hosted by Bit cloud.
   * otherwise, it is self-hosted
   */
  private async isHostedByBit(scopeName: string): Promise<boolean> {
    // TODO: once scope create a new API for this, replace it with the new one
    const remotes = await this.workspace.scope._legacyRemotes();
    return remotes.isHub(scopeName);
  }

  static async provider([cli, workspace]: [CLIMain, Workspace]) {
    const trackerMain = new TrackerMain(workspace);
    cli.register(new AddCmd(trackerMain));
    return trackerMain;
  }
}

TrackerAspect.addRuntime(TrackerMain);

export default TrackerMain;
