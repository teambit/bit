import { BitError } from '@teambit/bit-error';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import ComponentAspect, { Component, ComponentID, ComponentMain } from '@teambit/component';
import { DeprecationAspect, DeprecationMain } from '@teambit/deprecation';
import GraphqlAspect, { GraphqlMain } from '@teambit/graphql';
import NewComponentHelperAspect, { NewComponentHelperMain } from '@teambit/new-component-helper';
import RefactoringAspect, { MultipleStringsReplacement, RefactoringMain } from '@teambit/refactoring';
import { getBindingPrefixByDefaultScope } from '@teambit/legacy/dist/consumer/config/component-config';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { RenameCmd, RenameOptions } from './rename.cmd';
import { RenamingAspect } from './renaming.aspect';
import { RenamingFragment } from './renaming.fragment';
import { renamingSchema } from './renaming.graphql';
import { ScopeRenameCmd } from './scope-rename.cmd';

export class RenamingMain {
  constructor(
    private workspace: Workspace,
    private newComponentHelper: NewComponentHelperMain,
    private deprecation: DeprecationMain,
    private refactoring: RefactoringMain
  ) {}

  async rename(sourceIdStr: string, targetIdStr: string, options: RenameOptions): Promise<RenameDependencyNameResult> {
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

  /**
   * change the default-scope for new components. optionally (if refactor is true), change the source code to match the
   * new scope-name.
   * keep in mind that this is working for new components only, for tagged/exported it's impossible. See the errors
   * thrown in such cases in this method.
   */
  async renameScope(oldScope: string, newScope: string, options: { refactor?: boolean }): Promise<RenameScopeResult> {
    const allComponents = await this.workspace.list();
    const componentsUsingOldScope = allComponents.filter((comp) => comp.id.scope === oldScope);
    if (!componentsUsingOldScope.length && this.workspace.defaultScope !== oldScope) {
      throw new BitError(
        `none of the components is using "${oldScope}". also, the workspace is not configured with "${oldScope}"`
      );
    }
    // verify they're all new.
    const exported = componentsUsingOldScope.filter((comp) => comp.id._legacy.hasScope());
    if (exported.length) {
      const idsStr = exported.map((comp) => comp.id.toString()).join(', ');
      throw new BitError(`unable to rename the scope for the following exported components:\n${idsStr}
because these components were exported already, other components may use them and they'll break upon rename.
instead, deprecate the above components (using "bit deprecate"), tag, export and then eject them.
once they are not in the workspace, you can fork them ("bit fork") with the new scope-name`);
    }
    const tagged = componentsUsingOldScope.filter((comp) => comp.id.hasVersion());
    if (tagged.length) {
      const idsStr = tagged.map((comp) => comp.id.toString()).join(', ');
      throw new BitError(`unable to rename the scope for the following tagged components:\n${idsStr}
because these components were tagged, the objects have the dependencies data of the old-scope.
to be able to rename the scope, please untag the components first (using "bit untag" command)`);
    }
    if (this.workspace.defaultScope === oldScope) {
      await this.workspace.setDefaultScope(newScope);
      componentsUsingOldScope.forEach((comp) => this.workspace.bitMap.removeDefaultScope(comp.id));
    } else {
      componentsUsingOldScope.forEach((comp) => this.workspace.bitMap.setDefaultScope(comp.id, newScope));
    }
    await this.workspace.bitMap.write();
    const refactoredIds: ComponentID[] = [];
    if (options.refactor) {
      const legacyComps = componentsUsingOldScope.map((c) => c.state._consumer);
      const packagesToReplace: MultipleStringsReplacement = legacyComps.map((comp) => {
        return {
          oldStr: componentIdToPackageName(comp),
          newStr: componentIdToPackageName({
            ...comp,
            bindingPrefix: getBindingPrefixByDefaultScope(newScope),
            id: comp.id,
            defaultScope: newScope,
          }),
        };
      });
      const { changedComponents } = await this.refactoring.replaceMultipleStrings(allComponents, packagesToReplace);
      await Promise.all(changedComponents.map((comp) => this.workspace.write(comp)));
      refactoredIds.push(...changedComponents.map((c) => c.id));
    }

    return { scopeRenamedComponentIds: componentsUsingOldScope.map((comp) => comp.id), refactoredIds };
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

    const scopeCommand = cli.getCommand('scope');
    scopeCommand?.commands?.push(new ScopeRenameCmd(renaming));

    graphql.register(renamingSchema(renaming));
    componentMain.registerShowFragments([new RenamingFragment(renaming)]);
    return renaming;
  }
}

RenamingAspect.addRuntime(RenamingMain);

export type RenameDependencyNameResult = { sourceId: ComponentID; targetId: ComponentID };

export type RenamingInfo = {
  renamedFrom: ComponentID;
};

export type RenameScopeResult = { scopeRenamedComponentIds: ComponentID[]; refactoredIds: ComponentID[] };
