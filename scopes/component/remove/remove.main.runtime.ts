import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import semver from 'semver';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { WorkspaceAspect, OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { ConsumerNotFound } from '@teambit/legacy.consumer';
import { ImporterAspect, ImporterMain } from '@teambit/importer';
import { compact } from 'lodash';
import { hasWildcard } from '@teambit/legacy.utils';
import { BitError } from '@teambit/bit-error';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { IssuesClasses } from '@teambit/component-issues';
import { IssuesAspect, IssuesMain } from '@teambit/issues';
import pMapSeries from 'p-map-series';
import { NoHeadNoVersion } from '@teambit/legacy.scope';
import { ComponentAspect, Component, ComponentMain } from '@teambit/component';
import { deleteComponentsFiles } from './delete-component-files';
import { RemoveCmd } from './remove-cmd';
import { RemoveComponentsResult, removeComponents, removeComponentsFromNodeModules } from './remove-components';
import { RemoveAspect } from './remove.aspect';
import { RemoveFragment } from './remove.fragment';
import { RecoverCmd, RecoverOptions } from './recover-cmd';
import { DeleteCmd } from './delete-cmd';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { ListerAspect, ListerMain } from '@teambit/lister';
import chalk from 'chalk';

const BEFORE_REMOVE = 'removing components';

export type RemoveInfo = {
  removed: boolean;
  /**
   * whether to remove the component from default lane once merged
   */
  removeOnMain?: boolean;
  /**
   * Semver range to mark specific versions as deleted
   */
  range?: string;
  /**
   * Array of snap hashes to mark as deleted
   */
  snaps?: string[];
};

export type DeleteOpts = { updateMain?: boolean; range?: string; snaps?: string[] };

export class RemoveMain {
  constructor(
    private workspace: Workspace,
    private scope: ScopeMain,
    public logger: Logger,
    private importer: ImporterMain,
    private depResolver: DependencyResolverMain,
    private lister: ListerMain
  ) {}

  async remove({
    componentsPattern,
    force = false,
    remote = false,
    track = false,
    deleteFiles = true,
  }: {
    componentsPattern: string;
    force?: boolean;
    remote?: boolean;
    track?: boolean;
    deleteFiles?: boolean;
  }): Promise<RemoveComponentsResult> {
    this.logger.setStatusLine(BEFORE_REMOVE);
    const bitIds = remote
      ? await this.getRemoteBitIdsToRemove(componentsPattern)
      : await this.getLocalBitIdsToRemove(componentsPattern);
    this.logger.setStatusLine(BEFORE_REMOVE); // again because the loader might changed when talking to the remote
    const consumer = this.workspace?.consumer;
    const removeResults = await removeComponents({
      workspace: this.workspace,
      ids: ComponentIdList.fromArray(bitIds),
      force,
      remote,
      track,
      deleteFiles,
    });
    if (consumer) await consumer.onDestroy('remove');
    return removeResults;
  }

  /**
   * remove components from the workspace.
   */
  async removeLocallyByIds(
    ids: ComponentID[],
    { force = false, reasonForRemoval }: { force?: boolean; reasonForRemoval?: string } = {}
  ) {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const results = await removeComponents({
      workspace: this.workspace,
      ids: ComponentIdList.fromArray(ids),
      force,
      remote: false,
      track: false,
      deleteFiles: true,
    });
    await this.workspace.bitMap.write(`remove (by ${reasonForRemoval || 'N/A'})`);

    return results;
  }

  private async markRemoveComps(
    componentIds: ComponentID[],
    { updateMain, range, snaps }: DeleteOpts
  ): Promise<Component[]> {
    const allComponentsToMarkDeleted = await this.workspace.getMany(componentIds);

    const componentsToDeleteFromFs = range || snaps ? [] : allComponentsToMarkDeleted;
    const componentsIdsToDeleteFromFs = ComponentIdList.fromArray(componentsToDeleteFromFs.map((c) => c.id));
    await removeComponentsFromNodeModules(
      this.workspace.consumer,
      componentsToDeleteFromFs.map((c) => c.state._consumer)
    );
    // don't use `this.workspace.addSpecificComponentConfig`, if the component has component.json it will be deleted
    // during this removal along with the entire component dir.
    // in case this is range, the "removed" property is set to false. even when the range overlap the current version.
    // the reason is that if we set it to true, then, the component is considered as "deleted" for *all* versions.
    // remember that this config is always passed to the next version and if we set removed: true, it'll be copied
    // to the next version even when that version is not in the range.
    const config: RemoveInfo = { removed: !(range || snaps) };
    if (updateMain) config.removeOnMain = true;
    if (range) config.range = range;
    if (snaps && snaps.length) config.snaps = snaps;
    componentIds.forEach((compId) => this.workspace.bitMap.addComponentConfig(compId, RemoveAspect.id, config));
    await this.workspace.bitMap.write('delete');
    await deleteComponentsFiles(this.workspace.consumer, componentsIdsToDeleteFromFs);

    return componentsToDeleteFromFs;
  }

  async deleteComps(componentsPattern: string, opts: DeleteOpts = {}): Promise<Component[]> {
    if (!this.workspace) throw new ConsumerNotFound();
    const componentIds = await this.workspace.idsByPattern(componentsPattern);
    const newComps = componentIds.filter((id) => !id.hasVersion());
    if (newComps.length) {
      throw new BitError(
        `no need to delete the following new component(s), please remove them by "bit remove"\n${newComps
          .map((id) => id.toString())
          .join('\n')}`
      );
    }
    const currentLane = await this.workspace.getCurrentLaneObject();
    const { updateMain } = opts;
    if (!updateMain && currentLane?.isNew) {
      throw new Error(
        'no need to delete components from an un-exported lane, you can remove them by running "bit remove"'
      );
    }
    if (currentLane && !updateMain && opts.range) {
      throw new BitError(`--range is not needed when deleting components from a lane, unless --update-main is used`);
    }
    if (currentLane && !updateMain) {
      const laneComp = currentLane.toComponentIds();
      const compIdsNotOnLane = componentIds.filter((id) => !laneComp.hasWithoutVersion(id));
      if (compIdsNotOnLane.length) {
        throw new BitError(
          `unable to delete the following component(s) because they are not part of the current lane.
${chalk.bold(compIdsNotOnLane.map((id) => id.toString()).join('\n'))}
to simply remove them from the workspace, use "bit remove".
to delete them eventually from main, use "--update-main" flag and make sure to remove all occurrences from the code.`
        );
      }
    }
    return this.markRemoveComps(componentIds, opts);
  }

  /**
   * recover a soft-removed component.
   * there are 4 different scenarios.
   * 1. a component was just soft-removed, it wasn't snapped yet.  so it's now in .bitmap with the "removed" aspect entry.
   * 1.a. the component still exists in the local scope. no need to import. write it from there.
   * 1.b. the component doesn't exist in the local scope. import it.
   * 2. soft-removed and then snapped. It's not in .bitmap now.
   * 3. soft-removed, snapped, exported. it's not in .bitmap now.
   * 4. a soft-removed components was imported, so it's now in .bitmap without the "removed" aspect entry.
   * 5. workspace is empty. the soft-removed component is on the remote.
   * returns `true` if it was recovered. `false` if the component wasn't soft-removed, so nothing to recover from.
   */
  async recover(compIdStr: string, options: RecoverOptions): Promise<boolean> {
    if (!this.workspace) throw new ConsumerNotFound();
    const bitMapEntry = this.workspace.consumer.bitMap.components.find((compMap) => {
      return compMap.id.fullName === compIdStr || compMap.id.toStringWithoutVersion() === compIdStr;
    });
    const importComp = async (idStr: string) => {
      await this.importer.import({
        ids: [idStr],
        installNpmPackages: !options.skipDependencyInstallation,
        writeConfigFiles: !options.skipWriteConfigFiles,
        override: true,
      });
    };
    const setAsRemovedFalse = async (compId: ComponentID) => {
      await this.workspace.addSpecificComponentConfig(compId, RemoveAspect.id, { removed: false });
      await this.workspace.bitMap.write('recover');
    };
    if (bitMapEntry) {
      if (bitMapEntry.config?.[RemoveAspect.id]) {
        // case #1
        const compFromScope = await this.workspace.scope.get(bitMapEntry.id);
        if (compFromScope) {
          // in the case the component is in the scope, we prefer to write it from the scope rather than import it.
          // because in some cases the "import" throws an error, e.g. when the component is diverged.
          await this.workspace.write(compFromScope, bitMapEntry.rootDir);
          this.workspace.bitMap.removeComponentConfig(bitMapEntry.id, RemoveAspect.id, false);
          await this.workspace.bitMap.write('recover');
        } else {
          delete bitMapEntry.config?.[RemoveAspect.id];
          await importComp(bitMapEntry.id.toString());
        }
        return true;
      }
      // case #4
      const compId = bitMapEntry.id;
      const comp = await this.workspace.get(compId);
      const removeInfo = await this.getRemoveInfo(comp);
      if (!removeInfo.removed && !removeInfo.range) {
        return false;
      }
      await setAsRemovedFalse(compId);
      return true;
    }
    const compId = await this.workspace.scope.resolveComponentId(compIdStr);
    const currentLane = await this.workspace.getCurrentLaneObject();
    const idOnLane = currentLane?.getComponent(compId);
    const compIdWithPossibleVer = idOnLane ? compId.changeVersion(idOnLane.head.toString()) : compId;
    const compFromScope = await this.workspace.scope.get(compIdWithPossibleVer);
    if (compFromScope && (await this.isDeleted(compFromScope))) {
      // case #2 and #3
      await importComp(compIdWithPossibleVer._legacy.toString());
      await setAsRemovedFalse(compIdWithPossibleVer);
      return true;
    }
    // case #5
    let comp: Component | undefined;
    try {
      comp = await this.workspace.scope.getRemoteComponent(compId);
    } catch (err: any) {
      if (err instanceof NoHeadNoVersion) {
        throw new BitError(
          `unable to find the component ${compIdWithPossibleVer.toString()} in the current lane or main`
        );
      }
      throw err;
    }
    if (!(await this.isDeleted(comp))) {
      return false;
    }
    await importComp(compId._legacy.toString());
    await setAsRemovedFalse(compId);

    return true;
  }

  private async throwForMainComponentWhenOnLane(components: Component[]) {
    const currentLane = await this.workspace.getCurrentLaneObject();
    if (!currentLane) return; // user on main
    const laneComps = currentLane.toBitIds();
    const mainComps = components.filter((comp) => !laneComps.hasWithoutVersion(comp.id));
    if (mainComps.length) {
      throw new BitError(`the following components belong to main, they cannot be soft-removed when on a lane. consider removing them without --soft.
${mainComps.map((c) => c.id.toString()).join('\n')}`);
    }
  }

  async getRemoveInfo(component: Component): Promise<RemoveInfo> {
    const headComponent = await this.getHeadComponent(component);
    const data = headComponent.config.extensions.findExtension(RemoveAspect.id)?.config as RemoveInfo | undefined;

    const isDeletedByRange = () => {
      if (!data?.range) return false;
      const currentTag = component.getTag();
      return Boolean(currentTag && semver.satisfies(currentTag.version, data.range));
    };
    const isDeletedBySnaps = () => {
      if (!data?.snaps || !component.id.version) return false;
      return data.snaps.includes(component.id.version);
    };

    return {
      removed: data?.removed || isDeletedByRange() || isDeletedBySnaps() || false,
      range: data?.range,
      snaps: data?.snaps,
    };
  }

  private async getHeadComponent(component: Component): Promise<Component> {
    if (
      component.id.version &&
      component.head &&
      component.id.version !== component.head?.hash &&
      component.id.version !== component.headTag?.version.version
    ) {
      const headComp = this.workspace // if workspace exits, prefer using the workspace as it may be modified
        ? await this.workspace.get(component.id.changeVersion(undefined))
        : await this.scope.get(component.id.changeVersion(component.head.hash));
      if (!headComp) throw new Error(`unable to get the head of ${component.id.toString()}`);
      return headComp;
    }
    return component;
  }

  /**
   * @deprecated use `isDeleted` instead.
   */
  async isRemoved(component: Component): Promise<boolean> {
    return this.isDeleted(component);
  }

  /**
   * whether a component is marked as deleted.
   */
  async isDeleted(component: Component): Promise<boolean> {
    const removeInfo = await this.getRemoveInfo(component);
    return removeInfo.removed;
  }

  /**
   * performant version of isRemoved() in case the component object is not available and loading it is expensive.
   */
  async isRemovedByIdWithoutLoadingComponent(componentId: ComponentID): Promise<boolean> {
    if (!componentId.hasVersion()) return false;
    const bitmapEntry = this.workspace.bitMap.getBitmapEntryIfExist(componentId);
    if (bitmapEntry && bitmapEntry.isRemoved()) return true;
    if (bitmapEntry && bitmapEntry.isRecovered()) return false;
    const modelComp = await this.workspace.scope.getBitObjectModelComponent(componentId.changeVersion(undefined));
    if (!modelComp) return false;
    const isRemoved = await modelComp.isRemoved(
      this.workspace.scope.legacyScope.objects,
      componentId.version as string
    );
    return Boolean(isRemoved);
  }

  async isEnvByIdWithoutLoadingComponent(componentId: ComponentID): Promise<boolean> {
    const versionObj = await this.workspace.scope.getBitObjectVersionById(componentId);
    const envData = versionObj?.extensions.findCoreExtension('teambit.envs/envs');
    return envData?.data.type === 'env';
  }

  /**
   * get components that were soft-removed and tagged/snapped/merged but not exported yet.
   */
  async getRemovedStaged(): Promise<ComponentID[]> {
    return this.workspace.isOnMain() ? this.getRemovedStagedFromMain() : this.getRemovedStagedFromLane();
  }

  async addRemovedDependenciesIssues(components: Component[]) {
    await pMapSeries(components, async (component) => {
      await this.addRemovedDepIssue(component);
    });
  }

  private async addRemovedDepIssue(component: Component) {
    const dependencies = this.depResolver.getComponentDependencies(component);
    const removedDependencies: ComponentID[] = [];
    let removedEnv: ComponentID | undefined;
    await Promise.all(
      dependencies.map(async (dep) => {
        const isRemoved = await this.isRemovedByIdWithoutLoadingComponent(dep.componentId);
        if (!isRemoved) return;
        const isEnv = await this.isEnvByIdWithoutLoadingComponent(dep.componentId);
        if (isEnv) {
          removedEnv = dep.componentId;
        } else {
          removedDependencies.push(dep.componentId);
        }
      })
    );
    if (removedDependencies.length) {
      component.state.issues.getOrCreate(IssuesClasses.RemovedDependencies).data = removedDependencies.map((r) =>
        r.toString()
      );
    }
    if (removedEnv) {
      component.state.issues.getOrCreate(IssuesClasses.RemovedEnv).data = removedEnv.toString();
    }
  }

  private async getRemovedStagedFromMain(): Promise<ComponentID[]> {
    const stagedConfig = await this.workspace.scope.getStagedConfig();
    return stagedConfig
      .getAll()
      .filter((compConfig) => compConfig.config?.[RemoveAspect.id]?.removed)
      .map((compConfig) => compConfig.id);
  }

  private async getRemovedStagedFromLane(): Promise<ComponentID[]> {
    const currentLane = await this.workspace.getCurrentLaneObject();
    if (!currentLane) return [];
    const laneIds = currentLane.toComponentIds();
    const workspaceIds = this.workspace.listIds();
    const laneCompIdsNotInWorkspace = laneIds.filter(
      (id) => !workspaceIds.find((wId) => wId.isEqualWithoutVersion(id))
    );
    if (!laneCompIdsNotInWorkspace.length) return [];
    const comps = await this.workspace.scope.getMany(laneCompIdsNotInWorkspace);
    const removed = comps.filter((c) => this.isDeleted(c));
    const staged = await Promise.all(
      removed.map(async (c) => {
        const snapDistance = await this.workspace.scope.getSnapDistance(c.id, false);
        if (snapDistance.err) {
          this.logger.warn(
            `getRemovedStagedFromLane unable to get snapDistance for ${c.id.toString()} due to ${snapDistance.err.name}`
          );
          // todo: not clear what should be done here. should we consider it as removed-staged or not.
        }
        if (snapDistance.isSourceAhead()) return c.id;
        return undefined;
      })
    );
    return compact(staged);
  }

  private async getLocalBitIdsToRemove(componentsPattern: string): Promise<ComponentID[]> {
    if (!this.workspace) throw new ConsumerNotFound();
    const componentIds = await this.workspace.idsByPattern(componentsPattern);
    return componentIds.map((id) => id);
  }

  private async getRemoteBitIdsToRemove(componentsPattern: string): Promise<ComponentID[]> {
    if (hasWildcard(componentsPattern)) {
      return this.lister.getRemoteCompIdsByWildcards(componentsPattern);
    }
    return [ComponentID.fromString(componentsPattern)];
  }

  static slots = [];
  static dependencies = [
    WorkspaceAspect,
    ScopeAspect,
    CLIAspect,
    LoggerAspect,
    ComponentAspect,
    ImporterAspect,
    DependencyResolverAspect,
    IssuesAspect,
    ListerAspect,
  ];
  static runtime = MainRuntime;

  static async provider([
    workspace,
    scope,
    cli,
    loggerMain,
    componentAspect,
    importerMain,
    depResolver,
    issues,
    lister,
  ]: [
    Workspace,
    ScopeMain,
    CLIMain,
    LoggerMain,
    ComponentMain,
    ImporterMain,
    DependencyResolverMain,
    IssuesMain,
    ListerMain,
  ]) {
    const logger = loggerMain.createLogger(RemoveAspect.id);
    const removeMain = new RemoveMain(workspace, scope, logger, importerMain, depResolver, lister);
    issues.registerAddComponentsIssues(removeMain.addRemovedDependenciesIssues.bind(removeMain));
    componentAspect.registerShowFragments([new RemoveFragment(removeMain)]);
    cli.register(
      new RemoveCmd(removeMain, workspace),
      new DeleteCmd(removeMain, workspace),
      new RecoverCmd(removeMain)
    );
    return removeMain;
  }
}

RemoveAspect.addRuntime(RemoveMain);

export default RemoveMain;
