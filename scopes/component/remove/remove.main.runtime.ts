import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import WorkspaceAspect, { OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { BitId } from '@teambit/legacy-bit-id';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import ImporterAspect, { ImporterMain } from '@teambit/importer';
import { compact } from 'lodash';
import hasWildcard from '@teambit/legacy/dist/utils/string/has-wildcard';
import { getRemoteBitIdsByWildcards } from '@teambit/legacy/dist/api/consumer/lib/list-scope';
import { ComponentID } from '@teambit/component-id';
import { BitError } from '@teambit/bit-error';
import deleteComponentsFiles from '@teambit/legacy/dist/consumer/component-ops/delete-component-files';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { IssuesClasses } from '@teambit/component-issues';
import IssuesAspect, { IssuesMain } from '@teambit/issues';
import pMapSeries from 'p-map-series';
import ComponentAspect, { Component, ComponentMain } from '@teambit/component';
import { VersionNotFound } from '@teambit/legacy/dist/scope/exceptions';
import { removeComponentsFromNodeModules } from '@teambit/legacy/dist/consumer/component/package-json-utils';
import { RemoveCmd } from './remove-cmd';
import { removeComponents } from './remove-components';
import { RemoveAspect } from './remove.aspect';
import { RemoveFragment } from './remove.fragment';
import { RecoverCmd, RecoverOptions } from './recover-cmd';
import { DeleteCmd } from './delete-cmd';

const BEFORE_REMOVE = 'removing components';

export type RemoveInfo = {
  removed: boolean;
  /**
   * whether to remove the component from default lane once merged
   */
  removeOnMain?: boolean;
};

export class RemoveMain {
  constructor(
    private workspace: Workspace,
    public logger: Logger,
    private importer: ImporterMain,
    private depResolver: DependencyResolverMain
  ) {}

  async remove({
    componentsPattern,
    force = false,
    remote = false,
    track = false,
    deleteFiles = true,
    fromLane = false,
  }: {
    componentsPattern: string;
    force?: boolean;
    remote?: boolean;
    track?: boolean;
    deleteFiles?: boolean;
    fromLane?: boolean;
  }): Promise<any> {
    this.logger.setStatusLine(BEFORE_REMOVE);
    const bitIds = remote
      ? await this.getRemoteBitIdsToRemove(componentsPattern)
      : await this.getLocalBitIdsToRemove(componentsPattern);
    this.logger.setStatusLine(BEFORE_REMOVE); // again because the loader might changed when talking to the remote
    const consumer = this.workspace?.consumer;
    const removeResults = await removeComponents({
      consumer,
      ids: BitIds.fromArray(bitIds),
      force,
      remote,
      track,
      deleteFiles,
      fromLane,
    });
    if (consumer) await consumer.onDestroy();
    return removeResults;
  }

  /**
   * remove components from the workspace.
   */
  async removeLocallyByIds(ids: BitId[], { force = false }: { force?: boolean } = {}) {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const results = await removeComponents({
      consumer: this.workspace.consumer,
      ids: BitIds.fromArray(ids),
      force,
      remote: false,
      track: false,
      deleteFiles: true,
      fromLane: false,
    });
    await this.workspace.bitMap.write();

    return results;
  }

  async markRemoveComps(componentIds: ComponentID[], shouldUpdateMain = false) {
    const components = await this.workspace.getMany(componentIds);
    await removeComponentsFromNodeModules(
      this.workspace.consumer,
      components.map((c) => c.state._consumer)
    );
    // don't use `this.workspace.addSpecificComponentConfig`, if the component has component.json it will be deleted
    // during this removal along with the entire component dir.
    const config: RemoveInfo = { removed: true };
    if (shouldUpdateMain) config.removeOnMain = true;
    componentIds.map((compId) => this.workspace.bitMap.addComponentConfig(compId, RemoveAspect.id, config));
    await this.workspace.bitMap.write();
    const bitIds = BitIds.fromArray(componentIds.map((id) => id._legacy));
    await deleteComponentsFiles(this.workspace.consumer, bitIds);

    return componentIds;
  }

  async deleteComps(componentsPattern: string, opts: { updateMain?: boolean } = {}): Promise<ComponentID[]> {
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

    return this.markRemoveComps(componentIds, updateMain);
  }

  /**
   * recover a soft-removed component.
   * there are 4 different scenarios.
   * 1. a component was just soft-removed, it wasn't snapped yet.  so it's now in .bitmap with the "removed" aspect entry.
   * 2. soft-removed and then snapped. It's not in .bitmap now.
   * 3. soft-removed, snapped, exported. it's not in .bitmap now.
   * 4. a soft-removed components was imported, so it's now in .bitmap without the "removed" aspect entry.
   * 5. workspace is empty. the soft-removed component is on the remote.
   * returns `true` if it was recovered. `false` if the component wasn't soft-removed, so nothing to recover from.
   */
  async recover(compIdStr: string, options: RecoverOptions): Promise<boolean> {
    if (!this.workspace) throw new ConsumerNotFound();
    const bitMapEntry = this.workspace.consumer.bitMap.components.find((compMap) => {
      return compMap.id.name === compIdStr || compMap.id.toStringWithoutVersion() === compIdStr;
    });
    const importComp = async (idStr: string) => {
      await this.importer.import({
        ids: [idStr],
        installNpmPackages: !options.skipDependencyInstallation,
        override: true,
      });
    };
    const setAsRemovedFalse = async (compId: ComponentID) => {
      await this.workspace.addSpecificComponentConfig(compId, RemoveAspect.id, { removed: false });
      await this.workspace.bitMap.write();
    };
    if (bitMapEntry) {
      if (bitMapEntry.config?.[RemoveAspect.id]) {
        // case #1
        delete bitMapEntry.config?.[RemoveAspect.id];
        await importComp(bitMapEntry.id.toString());
        return true;
      }
      // case #4
      const compId = await this.workspace.resolveComponentId(bitMapEntry.id);
      const comp = await this.workspace.get(compId);
      if (!this.isRemoved(comp)) {
        return false;
      }
      await setAsRemovedFalse(compId);
      return true;
    }
    const compId = await this.workspace.scope.resolveComponentId(compIdStr);
    const currentLane = await this.workspace.getCurrentLaneObject();
    const idOnLane = currentLane?.getComponent(compId._legacy);
    const compIdWithPossibleVer = idOnLane ? compId.changeVersion(idOnLane.head.toString()) : compId;
    let compFromScope: Component | undefined;
    try {
      compFromScope = await this.workspace.scope.get(compIdWithPossibleVer);
    } catch (err: any) {
      if (err instanceof VersionNotFound && err.version === '0.0.0') {
        throw new BitError(
          `unable to find the component ${compIdWithPossibleVer.toString()} in the current lane or main`
        );
      }
      throw err;
    }
    if (compFromScope && this.isRemoved(compFromScope)) {
      // case #2 and #3
      await importComp(compIdWithPossibleVer._legacy.toString());
      await setAsRemovedFalse(compIdWithPossibleVer);
      return true;
    }
    // case #5
    const comp = await this.workspace.scope.getRemoteComponent(compId);
    if (!this.isRemoved(comp)) {
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
    const mainComps = components.filter((comp) => !laneComps.hasWithoutVersion(comp.id._legacy));
    if (mainComps.length) {
      throw new BitError(`the following components belong to main, they cannot be soft-removed when on a lane. consider removing them without --soft.
${mainComps.map((c) => c.id.toString()).join('\n')}`);
    }
  }

  getRemoveInfo(component: Component): RemoveInfo {
    const data = component.config.extensions.findExtension(RemoveAspect.id)?.config as RemoveInfo | undefined;
    return {
      removed: data?.removed || false,
    };
  }

  isRemoved(component: Component): boolean {
    return this.getRemoveInfo(component).removed;
  }

  /**
   * performant version of isRemoved() in case the component object is not available and loading it is expensive.
   */
  async isRemovedByIdWithoutLoadingComponent(componentId: ComponentID): Promise<boolean> {
    if (!componentId.hasVersion()) return false;
    const bitmapEntry = this.workspace.bitMap.getBitmapEntryIfExist(componentId);
    if (bitmapEntry && bitmapEntry.isRemoved()) return true;
    if (bitmapEntry && bitmapEntry.isRecovered()) return false;
    const modelComp = await this.workspace.scope.getBitObjectModelComponent(componentId);
    if (!modelComp) return false;
    const versionObj = await this.workspace.scope.getBitObjectVersion(modelComp, componentId.version);
    if (!versionObj) return false;
    return versionObj.isRemoved();
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
    const dependencies = await this.depResolver.getComponentDependencies(component);
    const removedWithUndefined = await Promise.all(
      dependencies.map(async (dep) => {
        const isRemoved = await this.isRemovedByIdWithoutLoadingComponent(dep.componentId);
        if (isRemoved) return dep.componentId;
        return undefined;
      })
    );
    const removed = compact(removedWithUndefined).map((id) => id.toString());
    if (removed.length) {
      component.state.issues.getOrCreate(IssuesClasses.RemovedDependencies).data = removed;
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
    const laneIds = currentLane.toBitIds();
    const workspaceIds = await this.workspace.listIds();
    const laneIdsNotInWorkspace = laneIds.filter(
      (id) => !workspaceIds.find((wId) => wId._legacy.isEqualWithoutVersion(id))
    );
    if (!laneIdsNotInWorkspace.length) return [];
    const laneCompIdsNotInWorkspace = await this.workspace.scope.resolveMultipleComponentIds(laneIdsNotInWorkspace);
    const comps = await this.workspace.scope.getMany(laneCompIdsNotInWorkspace);
    const removed = comps.filter((c) => this.isRemoved(c));
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

  private async getLocalBitIdsToRemove(componentsPattern: string): Promise<BitId[]> {
    if (!this.workspace) throw new ConsumerNotFound();
    const componentIds = await this.workspace.idsByPattern(componentsPattern);
    return componentIds.map((id) => id._legacy);
  }

  private async getRemoteBitIdsToRemove(componentsPattern: string): Promise<BitId[]> {
    if (hasWildcard(componentsPattern)) {
      return getRemoteBitIdsByWildcards(componentsPattern);
    }
    return [BitId.parse(componentsPattern, true)];
  }

  static slots = [];
  static dependencies = [
    WorkspaceAspect,
    CLIAspect,
    LoggerAspect,
    ComponentAspect,
    ImporterAspect,
    DependencyResolverAspect,
    IssuesAspect,
  ];
  static runtime = MainRuntime;

  static async provider([workspace, cli, loggerMain, componentAspect, importerMain, depResolver, issues]: [
    Workspace,
    CLIMain,
    LoggerMain,
    ComponentMain,
    ImporterMain,
    DependencyResolverMain,
    IssuesMain
  ]) {
    const logger = loggerMain.createLogger(RemoveAspect.id);
    const removeMain = new RemoveMain(workspace, logger, importerMain, depResolver);
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
