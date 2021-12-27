import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import ComponentAspect, { Component, ComponentID, ComponentMain } from '@teambit/component';
import { DeprecationAspect, DeprecationMain } from '@teambit/deprecation';
import NewComponentHelperAspect, { NewComponentHelperMain } from '@teambit/new-component-helper';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { RenameCmd, RenameOptions } from './rename.cmd';
import { RenamingAspect } from './renaming.aspect';
import { RenamingFragment } from './renaming.fragment';

export class RenamingMain {
  constructor(
    private workspace: Workspace,
    private newComponentHelper: NewComponentHelperMain,
    private deprecation: DeprecationMain
  ) {}

  async rename(sourceIdStr: string, targetIdStr: string, options: RenameOptions): Promise<RenameResult> {
    const sourceId = await this.workspace.resolveComponentId(sourceIdStr);
    const sourceComp = await this.workspace.get(sourceId);
    const targetId = this.newComponentHelper.getNewComponentId(targetIdStr, undefined, options?.scope);
    const targetPath = this.newComponentHelper.getNewComponentPath(targetId, options?.path);
    const config = await this.getConfig(sourceComp);
    await this.newComponentHelper.writeAndAddNewComp(sourceComp, targetPath, targetId, config);
    await this.deprecation.deprecate(sourceId, targetId);

    return {
      sourceId,
      targetId,
    };
  }

  getRenamingInfo(component: Component): RenamingInfo | null {
    const renameConfig = component.state.aspects.get(RenamingAspect.id)?.config as RenamingInfo | undefined;
    if (!renameConfig) return null;
    return {
      renamedFrom: ComponentID.fromObject(renameConfig.renamedFrom),
    };
  }

  private async getConfig(comp: Component) {
    const fromExisting = await this.newComponentHelper.getConfigFromExistingToNewComponent(comp);
    return {
      ...fromExisting,
      [RenamingAspect.id]: {
        renamedFrom: comp.id.toObject(),
      },
    };
  }

  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect, DeprecationAspect, NewComponentHelperAspect, ComponentAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace, deprecation, newComponentHelper, componentMain]: [
    CLIMain,
    Workspace,
    DeprecationMain,
    NewComponentHelperMain,
    ComponentMain
  ]) {
    const renaming = new RenamingMain(workspace, newComponentHelper, deprecation);
    cli.register(new RenameCmd(renaming));
    componentMain.registerShowFragments([new RenamingFragment(renaming)]);
    return renaming;
  }
}

RenamingAspect.addRuntime(RenamingMain);

export type RenameResult = { sourceId: ComponentID; targetId: ComponentID };

export type RenamingInfo = {
  renamedFrom: ComponentID;
};
