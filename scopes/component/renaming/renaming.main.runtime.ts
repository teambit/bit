import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import fs from 'fs-extra';
import path from 'path';
import { ConfigAspect, ConfigMain } from '@teambit/config';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { linkToNodeModulesByComponents } from '@teambit/workspace.modules.node-modules-linker';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import ComponentAspect, { Component, ComponentID, ComponentMain } from '@teambit/component';
import { DeprecationAspect, DeprecationMain } from '@teambit/deprecation';
import GraphqlAspect, { GraphqlMain } from '@teambit/graphql';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import EnvsAspect, { EnvsMain } from '@teambit/envs';
import NewComponentHelperAspect, { NewComponentHelperMain } from '@teambit/new-component-helper';
import RefactoringAspect, { MultipleStringsReplacement, RefactoringMain } from '@teambit/refactoring';
import ComponentWriterAspect, { ComponentWriterMain } from '@teambit/component-writer';
import { getBindingPrefixByDefaultScope } from '@teambit/legacy/dist/consumer/config/component-config';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { importTransformer, exportTransformer } from '@teambit/typescript';
import { InstallMain, InstallAspect } from '@teambit/install';
import { isValidIdChunk, InvalidName } from '@teambit/legacy-bit-id';
import { RenameCmd, RenameOptions } from './rename.cmd';
import { RenamingAspect } from './renaming.aspect';
import { RenamingFragment } from './renaming.fragment';
import { renamingSchema } from './renaming.graphql';
import { ScopeRenameCmd } from './scope-rename.cmd';
import { OldScopeNotFound } from './exceptions/old-scope-not-found';
import { OldScopeExported } from './exceptions/old-scope-exported';
import { OldScopeTagged } from './exceptions/old-scope-tagged';
import { ScopeRenameOwnerCmd } from './scope-rename-owner.cmd';

export class RenamingMain {
  constructor(
    private workspace: Workspace,
    private install: InstallMain,
    private newComponentHelper: NewComponentHelperMain,
    private deprecation: DeprecationMain,
    private refactoring: RefactoringMain,
    private config: ConfigMain,
    private componentWriter: ComponentWriterMain,
    private compiler: CompilerMain,
    private logger: Logger,
    private envs: EnvsMain
  ) {}

  async rename(sourceIdStr: string, targetName: string, options: RenameOptions): Promise<RenameDependencyNameResult> {
    if (!isValidIdChunk(targetName)) {
      if (targetName.includes('.'))
        throw new Error(`error: new-name argument "${targetName}" includes a dot.
make sure this argument is the name only, without the scope-name. to change the scope-name, use --scope flag`);
      throw new InvalidName(targetName);
    }
    const sourceId = await this.workspace.resolveComponentId(sourceIdStr);
    const isTagged = sourceId.hasVersion();
    const sourceComp = await this.workspace.get(sourceId);
    const sourcePackageName = this.workspace.componentPackageName(sourceComp);
    const targetId = this.newComponentHelper.getNewComponentId(targetName, undefined, options?.scope);
    if (!options.preserve) {
      await this.refactoring.refactorVariableAndClasses(sourceComp, sourceId, targetId);
      this.refactoring.refactorFilenames(sourceComp, sourceId, targetId);
    }
    if (isTagged) {
      const config = await this.getConfig(sourceComp);
      await this.newComponentHelper.writeAndAddNewComp(sourceComp, targetId, options, config);
      await this.deprecation.deprecate(sourceId, targetId);
    } else {
      this.workspace.bitMap.renameNewComponent(sourceId, targetId);
      await this.workspace.bitMap.write();
      await this.deleteLinkFromNodeModules(sourcePackageName);
    }
    await this.renameAspectIdInWorkspaceConfig(sourceId, targetId);
    this.workspace.clearComponentCache(sourceId);
    const targetComp = await this.workspace.get(targetId);
    if (options.refactor) {
      const allComponents = await this.workspace.list();
      const targetPackageName = this.workspace.componentPackageName(targetComp);
      const { changedComponents } = await this.refactoring.refactorDependencyName(
        allComponents,
        sourcePackageName,
        targetPackageName
      );
      await Promise.all(changedComponents.map((comp) => this.workspace.write(comp)));
    }
    if (!options.preserve) {
      await this.refactoring.refactorVariableAndClasses(targetComp, sourceId, targetId);
      this.refactoring.refactorFilenames(targetComp, sourceId, targetId);
      await this.componentWriter.writeMany({
        components: [targetComp.state._consumer],
        skipDependencyInstallation: true,
        writeToPath: this.newComponentHelper.getNewComponentPath(targetId),
      });
    }
    this.workspace.bitMap.renameAspectInConfig(sourceId, targetId);
    await this.workspace.bitMap.write();

    await linkToNodeModulesByComponents([targetComp], this.workspace); // link the new-name to node-modules
    await this.compileGracefully([targetComp.id]);

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
      throw new OldScopeNotFound(oldScope);
    }
    const envs = componentsUsingOldScope.filter((c) => this.envs.isEnv(c));
    const compsUsingEnv = {};
    await Promise.all(
      envs.map(async (env) => {
        const components = await this.workspace.getComponentsUsingEnv(env.id.toString(), true);
        if (!components.length) return;
        const componentIds = components.map((comp) => comp.id);
        compsUsingEnv[env.id.toString()] = componentIds;
      })
    );

    // verify they're all new.
    const exported = componentsUsingOldScope.filter((comp) => comp.id._legacy.hasScope());
    if (exported.length) {
      const idsStr = exported.map((comp) => comp.id.toString());
      throw new OldScopeExported(idsStr);
    }
    const tagged = componentsUsingOldScope.filter((comp) => comp.id.hasVersion());
    if (tagged.length) {
      const idsStr = tagged.map((comp) => comp.id.toString());
      throw new OldScopeTagged(idsStr);
    }
    if (this.workspace.defaultScope === oldScope) {
      await this.workspace.setDefaultScope(newScope);
      componentsUsingOldScope.forEach((comp) => this.workspace.bitMap.removeDefaultScope(comp.id));
    } else {
      componentsUsingOldScope.forEach((comp) => this.workspace.bitMap.setDefaultScope(comp.id, newScope));
    }
    await this.workspace.bitMap.write();
    await this.workspace.clearCache();

    await Promise.all(
      envs.map(async (env) => {
        const componentIds = compsUsingEnv[env.id.toString()];
        if (!componentIds.length) return;
        await this.workspace.setEnvToComponents(env.id.changeScope(newScope), componentIds);
      })
    );

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
      const { changedComponents } = await this.refactoring.replaceMultipleStrings(allComponents, packagesToReplace, [
        importTransformer,
        exportTransformer,
      ]);
      await this.renameScopeOfAspectIdsInWorkspaceConfig(
        componentsUsingOldScope.map((c) => c.id),
        newScope
      );
      await Promise.all(changedComponents.map((comp) => this.workspace.write(comp)));
      refactoredIds.push(...changedComponents.map((c) => c.id));
    }

    const newIds = componentsUsingOldScope.map((comp) => new ComponentID(comp.id._legacy, newScope));
    await this.relinkAndCompile(componentsUsingOldScope, newIds);

    return { scopeRenamedComponentIds: componentsUsingOldScope.map((comp) => comp.id), refactoredIds };
  }

  private async relinkAndCompile(componentsUsingOldScope: Component[], newIds: ComponentID[]) {
    this.logger.debug(`the scope has been renamed, re-linking to node-modules`);
    await Promise.all(
      componentsUsingOldScope.map(async (comp) => {
        const pkgName = this.workspace.componentPackageName(comp);
        await this.deleteLinkFromNodeModules(pkgName);
      })
    );

    await this.workspace.clearCache();
    await this.workspace._reloadConsumer();

    const newComps = await this.workspace.getMany(newIds);
    await linkToNodeModulesByComponents(newComps, this.workspace); // link the new-name to node-modules
    await this.compileGracefully(newIds);
  }

  /**
   * change the default-scope for new components. optionally (if refactor is true), change the source code to match the
   * new scope-name.
   * keep in mind that this is working for new components only, for tagged/exported it's impossible. See the errors
   * thrown in such cases in this method.
   */
  async renameOwner(oldOwner: string, newOwner: string, options: { refactor?: boolean }): Promise<RenameScopeResult> {
    const allComponents = await this.workspace.list();
    const isScopeUsesOldOwner = (scope: string) => scope.startsWith(`${oldOwner}.`);
    const componentsUsingOldScope = allComponents.filter((comp) => isScopeUsesOldOwner(comp.id.scope));
    if (!componentsUsingOldScope.length && !isScopeUsesOldOwner(this.workspace.defaultScope)) {
      throw new OldScopeNotFound(oldOwner);
    }
    // verify they're all new.
    const exported = componentsUsingOldScope.filter((comp) => comp.id._legacy.hasScope());
    if (exported.length) {
      const idsStr = exported.map((comp) => comp.id.toString());
      throw new OldScopeExported(idsStr);
    }
    const tagged = componentsUsingOldScope.filter((comp) => comp.id.hasVersion());
    if (tagged.length) {
      const idsStr = tagged.map((comp) => comp.id.toString());
      throw new OldScopeTagged(idsStr);
    }
    const oldWorkspaceDefaultScope = this.workspace.defaultScope;
    const newWorkspaceDefaultScope = isScopeUsesOldOwner(oldWorkspaceDefaultScope)
      ? this.renameOwnerInScopeName(oldWorkspaceDefaultScope, oldOwner, newOwner)
      : undefined;
    if (newWorkspaceDefaultScope) {
      await this.workspace.setDefaultScope(newWorkspaceDefaultScope);
    }
    const newIds = componentsUsingOldScope.map((comp) => {
      if (newWorkspaceDefaultScope && comp.id.scope === oldWorkspaceDefaultScope) {
        this.workspace.bitMap.removeDefaultScope(comp.id);
        return new ComponentID(comp.id._legacy, newWorkspaceDefaultScope);
      }
      const newCompScope = this.renameOwnerInScopeName(comp.id.scope, oldOwner, newOwner);
      this.workspace.bitMap.setDefaultScope(comp.id, newCompScope);
      return new ComponentID(comp.id._legacy, newCompScope);
    });
    await this.workspace.bitMap.write();
    const refactoredIds: ComponentID[] = [];
    if (options.refactor) {
      const legacyComps = componentsUsingOldScope.map((c) => c.state._consumer);
      const packagesToReplace: MultipleStringsReplacement = legacyComps.map((comp) => {
        const newScope = this.renameOwnerInScopeName(comp.id.scope, oldOwner, newOwner);
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
      const { changedComponents } = await this.refactoring.replaceMultipleStrings(allComponents, packagesToReplace, [
        importTransformer,
        exportTransformer,
      ]);
      await this.renameOwnerOfAspectIdsInWorkspaceConfig(
        componentsUsingOldScope.map((c) => c.id),
        oldOwner,
        newOwner
      );
      await Promise.all(changedComponents.map((comp) => this.workspace.write(comp)));
      refactoredIds.push(...changedComponents.map((c) => c.id));
    }

    await this.relinkAndCompile(componentsUsingOldScope, newIds);

    return { scopeRenamedComponentIds: componentsUsingOldScope.map((comp) => comp.id), refactoredIds };
  }

  private async renameAspectIdInWorkspaceConfig(sourceId: ComponentID, targetId: ComponentID) {
    const config = this.config.workspaceConfig;
    if (!config) throw new Error('unable to get workspace config');
    const hasChanged = config.renameExtensionInRaw(
      sourceId.toStringWithoutVersion(),
      targetId.toStringWithoutVersion()
    );
    if (hasChanged) await config.write();
  }

  private async renameScopeOfAspectIdsInWorkspaceConfig(ids: ComponentID[], newScope: string) {
    const config = this.config.workspaceConfig;
    if (!config) throw new Error('unable to get workspace config');
    let hasChanged = false;
    ids.forEach((id) => {
      const changed = config.renameExtensionInRaw(
        id.toStringWithoutVersion(),
        id._legacy.changeScope(newScope).toStringWithoutVersion()
      );
      if (changed) hasChanged = true;
    });
    if (hasChanged) await config.write();
  }

  private async renameOwnerOfAspectIdsInWorkspaceConfig(ids: ComponentID[], oldOwner: string, newOwner: string) {
    const config = this.config.workspaceConfig;
    if (!config) throw new Error('unable to get workspace config');
    let hasChanged = false;
    ids.forEach((id) => {
      const newScope = this.renameOwnerInScopeName(id.scope, oldOwner, newOwner);
      const changed = config.renameExtensionInRaw(
        id.toStringWithoutVersion(),
        id._legacy.changeScope(newScope).toStringWithoutVersion()
      );
      if (changed) hasChanged = true;
    });
    if (hasChanged) await config.write();
  }

  private async deleteLinkFromNodeModules(packageName: string) {
    await fs.remove(path.join(this.workspace.path, 'node_modules', packageName));
  }
  private async compileGracefully(ids: ComponentID[]) {
    try {
      await this.compiler.compileOnWorkspace(ids);
    } catch (err: any) {
      const idsStr = ids.map((id) => id.toString()).join(', ');
      this.logger.consoleFailure(`failed compiling the component(s) ${idsStr}. error: ${err.message}`);
    }
  }

  private renameOwnerInScopeName(scopeName: string, oldOwner: string, newOwner: string): string {
    return scopeName.replace(`${oldOwner}.`, `${newOwner}.`);
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
    InstallAspect,
    ConfigAspect,
    ComponentWriterAspect,
    CompilerAspect,
    LoggerAspect,
    EnvsAspect,
  ];
  static runtime = MainRuntime;
  static async provider([
    cli,
    workspace,
    deprecation,
    newComponentHelper,
    componentMain,
    graphql,
    refactoring,
    install,
    config,
    componentWriter,
    compiler,
    loggerMain,
    envs,
  ]: [
    CLIMain,
    Workspace,
    DeprecationMain,
    NewComponentHelperMain,
    ComponentMain,
    GraphqlMain,
    RefactoringMain,
    InstallMain,
    ConfigMain,
    ComponentWriterMain,
    CompilerMain,
    LoggerMain,
    EnvsMain
  ]) {
    const logger = loggerMain.createLogger(RenamingAspect.id);
    const renaming = new RenamingMain(
      workspace,
      install,
      newComponentHelper,
      deprecation,
      refactoring,
      config,
      componentWriter,
      compiler,
      logger,
      envs
    );
    cli.register(new RenameCmd(renaming));

    const scopeCommand = cli.getCommand('scope');
    scopeCommand?.commands?.push(new ScopeRenameCmd(renaming));
    scopeCommand?.commands?.push(new ScopeRenameOwnerCmd(renaming));

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
