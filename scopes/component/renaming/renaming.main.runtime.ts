import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import ComponentAspect, { Component, ComponentID, ComponentMain } from '@teambit/component';
import { DeprecationAspect, DeprecationMain } from '@teambit/deprecation';
import GraphqlAspect, { GraphqlMain } from '@teambit/graphql';
import NewComponentHelperAspect, { NewComponentHelperMain } from '@teambit/new-component-helper';
import RefactoringAspect, { RefactoringMain } from '@teambit/refactoring';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { RenameCmd, RenameOptions } from './rename.cmd';
import { RenamingAspect } from './renaming.aspect';
import { RenamingFragment } from './renaming.fragment';
import { renamingSchema } from './renaming.graphql';

export class RenamingMain {
  constructor(
    private workspace: Workspace,
    private newComponentHelper: NewComponentHelperMain,
    private deprecation: DeprecationMain,
    private refactoring: RefactoringMain
  ) {}

  async rename(sourceIdStr: string, targetIdStr: string, options: RenameOptions): Promise<RenameResult> {
    const sourceId = await this.workspace.resolveComponentId(sourceIdStr);
    const isTagged = sourceId.hasVersion();
    const sourceComp = await this.workspace.get(sourceId);
    const targetId = this.newComponentHelper.getNewComponentId(targetIdStr, undefined, options?.scope);
    if (isTagged) {
      const config = await this.getConfig(sourceComp);
      await this.newComponentHelper.writeAndAddNewComp(sourceComp, targetId, options, config);
      await this.deprecation.deprecate(sourceId, targetId);
    } else {
      this.workspace.bitMap.renameNewComponent(sourceId, targetId);
      await this.workspace.bitMap.write();
    }
    if (options.refactor) {
      const allComponents = await this.workspace.list();
      const { changedComponents } = await this.refactoring.refactorDependencyName(allComponents, sourceId, targetId);
      await Promise.all(changedComponents.map((comp) => this.workspace.write(comp)));
    }

    await this.workspace.link();

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
  static dependencies = [
    CLIAspect,
    WorkspaceAspect,
    DeprecationAspect,
    NewComponentHelperAspect,
    ComponentAspect,
    GraphqlAspect,
    RefactoringAspect,
  ];
  static runtime = MainRuntime;
  static async provider([cli, workspace, deprecation, newComponentHelper, componentMain, graphql, refactoring]: [
    CLIMain,
    Workspace,
    DeprecationMain,
    NewComponentHelperMain,
    ComponentMain,
    GraphqlMain,
    RefactoringMain
  ]) {
    const renaming = new RenamingMain(workspace, newComponentHelper, deprecation, refactoring);
    cli.register(new RenameCmd(renaming));
    graphql.register(renamingSchema(renaming));
    componentMain.registerShowFragments([new RenamingFragment(renaming)]);
    return renaming;
  }
}

RenamingAspect.addRuntime(RenamingMain);

export type RenameResult = { sourceId: ComponentID; targetId: ComponentID };

export type RenamingInfo = {
  renamedFrom: ComponentID;
};
