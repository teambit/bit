import fs from 'fs-extra';
import path from 'path';
import type { ConfigMain } from '@teambit/config';
import { ConfigAspect } from '@teambit/config';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import { linkToNodeModulesByComponents } from '@teambit/workspace.modules.node-modules-linker';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import type { Component, ComponentMain } from '@teambit/component';
import { ComponentAspect, ComponentID } from '@teambit/component';
import type { DeprecationMain } from '@teambit/deprecation';
import { DeprecationAspect } from '@teambit/deprecation';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import { compact } from 'lodash';
import type { CompilerMain } from '@teambit/compiler';
import { CompilerAspect } from '@teambit/compiler';
import type { EnvsMain } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs';
import type { NewComponentHelperMain } from '@teambit/new-component-helper';
import { NewComponentHelperAspect } from '@teambit/new-component-helper';
import type { RemoveMain } from '@teambit/remove';
import { RemoveAspect } from '@teambit/remove';
import type { MultipleStringsReplacement, RefactoringMain } from '@teambit/refactoring';
import { RefactoringAspect } from '@teambit/refactoring';
import type { ComponentWriterMain } from '@teambit/component-writer';
import { ComponentWriterAspect } from '@teambit/component-writer';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect, OutsideWorkspaceError } from '@teambit/workspace';
import pMapSeries from 'p-map-series';
import type { InstallMain } from '@teambit/install';
import { InstallAspect } from '@teambit/install';
import { isValidIdChunk, InvalidName } from '@teambit/legacy-bit-id';
import type { RenameOptions } from './rename.cmd';
import { RenameCmd } from './rename.cmd';
import { RenamingAspect } from './renaming.aspect';
import { RenamingFragment } from './renaming.fragment';
import { renamingSchema } from './renaming.graphql';
import { ScopeRenameCmd } from './scope-rename.cmd';
import { OldScopeNotFound } from './exceptions/old-scope-not-found';
import { ScopeRenameOwnerCmd } from './scope-rename-owner.cmd';
import { RenamingTagged } from './exceptions/renaming-tagged';

type RenameId = { sourceId: ComponentID; targetId: ComponentID };
type RenameData = RenameId & {
  sourcePkg: string;
  isTagged: boolean;
  targetPkg?: string;
  targetComp?: Component;
  compIdsUsingItAsEnv?: ComponentID[];
};
export type RenameResult = { renameData: RenameData[]; refactoredIds: ComponentID[] };

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
    private envs: EnvsMain,
    private remove: RemoveMain
  ) {}

  async rename(
    sourceIdStr: string,
    targetName: string,
    options: RenameOptions = {}
  ): Promise<RenameDependencyNameResult> {
    if (!isValidIdChunk(targetName)) {
      if (targetName.includes('.'))
        throw new Error(`error: new-name argument "${targetName}" includes a dot.
make sure this argument is the name only, without the scope-name. to change the scope-name, use --scope flag`);
      throw new InvalidName(targetName);
    }
    const sourceId = await this.workspace.resolveComponentId(sourceIdStr);
    const targetId = this.newComponentHelper.getNewComponentId(targetName, undefined, options?.scope || sourceId.scope);
    await this.renameMultiple([{ sourceId, targetId }], options);

    return {
      sourceId,
      targetId,
    };
  }

  async renameMultiple(multipleIds: RenameId[], options: RenameOptions): Promise<RenameResult> {
    const renameData: RenameData[] = [];

    const stagedComps = multipleIds.filter(
      ({ sourceId }) => sourceId.hasVersion() && !this.workspace.isExported(sourceId)
    );

    if (stagedComps.length) {
      const idsStr = stagedComps.map(({ sourceId }) => sourceId.toString());
      throw new RenamingTagged(idsStr);
    }

    await pMapSeries(multipleIds, async ({ sourceId, targetId }) => {
      const isTagged = sourceId.hasVersion();
      const sourceComp = await this.workspace.get(sourceId);
      const isEnv = this.envs.isEnv(sourceComp);
      const sourcePackageName = this.workspace.componentPackageName(sourceComp);
      renameData.push({
        sourceId,
        targetId,
        sourcePkg: sourcePackageName,
        isTagged,
        compIdsUsingItAsEnv: isEnv
          ? (await this.workspace.getComponentsUsingEnv(sourceId.toString(), true)).map((c) => c.id)
          : undefined,
      });
    });

    await pMapSeries(renameData, async ({ sourceId, targetId, isTagged, sourcePkg }) => {
      const sourceComp = await this.workspace.get(sourceId);
      if (!options.preserve) {
        await this.refactoring.refactorVariableAndClasses(sourceComp, sourceId, targetId);
        this.refactoring.refactorFilenames(sourceComp, sourceId, targetId);
      }
      if (isTagged) {
        const config = await this.getConfig(sourceComp);
        await this.newComponentHelper.writeAndAddNewComp(sourceComp, targetId, options, config);
        options.deprecate
          ? await this.deprecation.deprecate(sourceId, targetId)
          : await this.remove.deleteComps(sourceId.toString(), { updateMain: true });
      } else {
        this.workspace.bitMap.renameNewComponent(sourceId, targetId);
        await this.deleteLinkFromNodeModules(sourcePkg);
      }
    });
    await this.workspace.bitMap.write(`rename`);
    await this.renameAspectIdsInWorkspaceConfig(multipleIds);
    await this.workspace._reloadConsumer(); // in order to reload .bitmap file and clear all caches.
    await this.changeEnvsAccordingToNewIds(renameData);
    await pMapSeries(renameData, async (itemData) => {
      itemData.targetComp = await this.workspace.get(itemData.targetId);
      itemData.targetPkg = this.workspace.componentPackageName(itemData.targetComp);
    });

    const refactoredIds: ComponentID[] = [];
    if (options.refactor) {
      const allComponents = await this.workspace.list();
      const packagesToReplace: MultipleStringsReplacement = renameData.map(({ sourcePkg, targetPkg }) => {
        if (!targetPkg) throw new Error(`renameMultiple, targetPkg is missing`);
        return {
          // replace only packages ending with slash, quote or double-quote. otherwise, it could replace part of other packages.
          oldStr: `${sourcePkg}(['"/])`,
          newStr: `${targetPkg}$1`,
        };
      });

      const { changedComponents } = await this.refactoring.replaceMultipleStrings(allComponents, packagesToReplace);
      await Promise.all(changedComponents.map((comp) => this.workspace.write(comp)));
      refactoredIds.push(...changedComponents.map((c) => c.id));
    }

    if (!options.preserve) {
      await pMapSeries(renameData, async ({ sourceId, targetId, targetComp, isTagged }) => {
        if (isTagged) {
          // we have done this logic already for tagged components before. (search for refactorVariableAndClasses).
          return;
        }
        if (!targetComp) throw new Error(`renameMultiple, targetComp is missing`);
        await this.refactoring.refactorVariableAndClasses(targetComp, sourceId, targetId, options);
        const compPath = this.newComponentHelper.getNewComponentPath(targetId);
        this.refactoring.refactorFilenames(targetComp, sourceId, targetId);
        await this.componentWriter.writeMany({
          components: [targetComp.state._consumer],
          skipDependencyInstallation: true,
          writeToPath: path.join(this.workspace.path, compPath),
          reasonForBitmapChange: 'rename',
        });
      });
    }

    multipleIds.forEach(({ sourceId, targetId }) => {
      this.workspace.bitMap.renameAspectInConfig(sourceId, targetId);
    });

    await this.workspace.bitMap.write(`rename`);

    const targetComps = compact(renameData.map(({ targetComp }) => targetComp));
    await linkToNodeModulesByComponents(targetComps, this.workspace); // link the new-name to node-modules
    await this.compileGracefully(targetComps.map((c) => c.id));

    return { refactoredIds, renameData };
  }

  getRenamingInfo(component: Component): RenamingInfo | null {
    const renameConfig = component.state.aspects.get(RenamingAspect.id)?.config as RenamingInfo | undefined;
    if (!renameConfig) return null;
    return {
      renamedFrom: ComponentID.fromObject(renameConfig.renamedFrom),
    };
  }

  /**
   * change the default-scope for new components.
   * for tagged/exported components, delete (or deprecate - depends on the flag) the original ones and create new ones.
   * optionally (if refactor is true), change the source code to match the new scope-name.
   */
  async renameScope(
    oldScope: string,
    newScope: string,
    options: { refactor?: boolean; deprecate?: boolean; preserve?: boolean } = {}
  ): Promise<RenameResult> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const allComponentsIds = this.workspace.listIds();
    const componentsUsingOldScope = allComponentsIds.filter((compId) => compId.scope === oldScope);
    if (!componentsUsingOldScope.length && this.workspace.defaultScope !== oldScope) {
      throw new OldScopeNotFound(oldScope);
    }
    if (this.workspace.defaultScope === oldScope) {
      await this.workspace.setDefaultScope(newScope, false);
    }
    const multipleIds: RenameId[] = componentsUsingOldScope.map((compId) => {
      const targetId = ComponentID.fromObject({ name: compId.fullName }, newScope);
      return { sourceId: compId, targetId };
    });
    return this.renameMultiple(multipleIds, options);
  }

  /**
   * change the default-scope for new components. optionally (if refactor is true), change the source code to match the
   * new scope-name.
   * keep in mind that this is working for new components only, for tagged/exported it's impossible. See the errors
   * thrown in such cases in this method.
   */
  async renameOwner(
    oldOwner: string,
    newOwner: string,
    options: { refactor?: boolean; ast?: boolean }
  ): Promise<RenameResult> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const isScopeUsesOldOwner = (scope: string) => scope.startsWith(`${oldOwner}.`);
    const allComponentsIds = this.workspace.listIds();
    const componentsUsingOldScope = allComponentsIds.filter((compId) => isScopeUsesOldOwner(compId.scope));
    if (!componentsUsingOldScope.length && !isScopeUsesOldOwner(this.workspace.defaultScope)) {
      throw new OldScopeNotFound(oldOwner);
    }
    const oldWorkspaceDefaultScope = this.workspace.defaultScope;
    const newWorkspaceDefaultScope = isScopeUsesOldOwner(oldWorkspaceDefaultScope)
      ? this.renameOwnerInScopeName(oldWorkspaceDefaultScope, oldOwner, newOwner)
      : undefined;
    if (newWorkspaceDefaultScope) {
      await this.workspace.setDefaultScope(newWorkspaceDefaultScope, false);
    }
    const multipleIds: RenameId[] = componentsUsingOldScope.map((compId) => {
      const newScope = this.renameOwnerInScopeName(compId.scope, oldOwner, newOwner);
      const targetId = compId.hasScope() ? compId.changeScope(newScope) : compId.changeDefaultScope(newScope);
      return { sourceId: compId, targetId };
    });
    return this.renameMultiple(multipleIds, { ...options, preserve: true });
  }

  private async renameAspectIdsInWorkspaceConfig(ids: RenameId[]) {
    const config = this.config.workspaceConfig;
    if (!config) throw new Error('unable to get workspace config');
    const wereChangesDone = ids.map((renameId) =>
      config.renameExtensionInRaw(
        renameId.sourceId.toStringWithoutVersion(),
        renameId.targetId.toStringWithoutVersion()
      )
    );
    const hasChanged = wereChangesDone.some((isChanged) => isChanged);
    if (hasChanged) await config.write({ reasonForChange: 'rename' });
  }
  private async changeEnvsAccordingToNewIds(renameData: RenameData[]) {
    await pMapSeries(renameData, async (renameItem) => {
      const componentIds = renameItem.compIdsUsingItAsEnv;
      if (!componentIds?.length) return;
      const newEnvId = renameItem.targetId;
      const newComponentIds = componentIds.map((id) => {
        const found = renameData.find((r) => r.sourceId.isEqualWithoutVersion(id));
        return found ? found.targetId : id;
      });
      await this.workspace.setEnvToComponents(newEnvId, newComponentIds);
    });
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
    RemoveAspect,
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
    remove,
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
    EnvsMain,
    RemoveMain,
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
      envs,
      remove
    );
    cli.register(new RenameCmd(renaming));

    const scopeCommand = cli.getCommand('scope');
    scopeCommand?.commands?.push(new ScopeRenameCmd(renaming));
    scopeCommand?.commands?.push(new ScopeRenameOwnerCmd(renaming));

    graphql.register(() => renamingSchema(renaming));
    componentMain.registerShowFragments([new RenamingFragment(renaming)]);
    return renaming;
  }
}

RenamingAspect.addRuntime(RenamingMain);

export type RenameDependencyNameResult = { sourceId: ComponentID; targetId: ComponentID };

export type RenamingInfo = {
  renamedFrom: ComponentID;
};

export default RenamingMain;
