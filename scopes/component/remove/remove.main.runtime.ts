import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { BitId } from '@teambit/legacy-bit-id';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import ImporterAspect, { ImporterMain } from '@teambit/importer';
import hasWildcard from '@teambit/legacy/dist/utils/string/has-wildcard';
import { getRemoteBitIdsByWildcards } from '@teambit/legacy/dist/api/consumer/lib/list-scope';
import { ComponentID } from '@teambit/component-id';
import { BitError } from '@teambit/bit-error';
import deleteComponentsFiles from '@teambit/legacy/dist/consumer/component-ops/delete-component-files';
import ComponentAspect, { Component, ComponentMain } from '@teambit/component';
import { removeComponentsFromNodeModules } from '@teambit/legacy/dist/consumer/component/package-json-utils';
import { RemoveCmd } from './remove-cmd';
import { removeComponents } from './remove-components';
import { RemoveAspect } from './remove.aspect';
import { RemoveFragment } from './remove.fragment';
import { RecoverCmd, RecoverOptions } from './recover-cmd';

const BEFORE_REMOVE = 'removing components';

export type RemoveInfo = {
  removed: boolean;
};

export class RemoveMain {
  constructor(private workspace: Workspace, private logger: Logger, private importer: ImporterMain) {}

  async remove({
    componentsPattern,
    force,
    remote,
    track,
    deleteFiles,
    fromLane,
  }: {
    componentsPattern: string;
    force: boolean;
    remote: boolean;
    track: boolean;
    deleteFiles: boolean;
    fromLane: boolean;
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

  async softRemove(componentsPattern: string): Promise<ComponentID[]> {
    if (!this.workspace) throw new ConsumerNotFound();
    const currentLane = await this.workspace.getCurrentLaneObject();
    if (currentLane?.isNew) {
      throw new BitError(
        `unable to soft-remove on a new (not-exported) lane "${currentLane.name}". please remove without --soft`
      );
    }
    const componentIds = await this.workspace.idsByPattern(componentsPattern);
    const components = await this.workspace.getMany(componentIds);
    const newComps = components.filter((c) => !c.id.hasVersion());
    if (newComps.length) {
      throw new BitError(
        `unable to soft-remove the following new component(s), please remove them without --soft\n${newComps
          .map((c) => c.id.toString())
          .join('\n')}`
      );
    }
    await this.throwForMainComponentWhenOnLane(components);
    await removeComponentsFromNodeModules(
      this.workspace.consumer,
      components.map((c) => c.state._consumer)
    );
    // don't use `this.workspace.addSpecificComponentConfig`, if the component has component.json it will be deleted
    // during this removal along with the entire component dir.
    componentIds.map((compId) =>
      this.workspace.bitMap.addComponentConfig(compId, RemoveAspect.id, {
        removed: true,
      })
    );
    await this.workspace.bitMap.write();
    const bitIds = BitIds.fromArray(componentIds.map((id) => id._legacy));
    await deleteComponentsFiles(this.workspace.consumer, bitIds);

    return componentIds;
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
    const compFromScope = await this.workspace.scope.get(compId);
    if (compFromScope && this.isRemoved(compFromScope)) {
      // case #2 and #3
      await importComp(compId._legacy.toString());
      await setAsRemovedFalse(compId);
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
   * get components that were soft-removed and tagged/snapped but not exported yet.
   */
  async getRemovedStaged(): Promise<ComponentID[]> {
    const stagedConfig = await this.workspace.scope.getStagedConfig();
    return stagedConfig
      .getAll()
      .filter((compConfig) => compConfig.config?.[RemoveAspect.id]?.removed)
      .map((compConfig) => compConfig.id);
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
  static dependencies = [WorkspaceAspect, CLIAspect, LoggerAspect, ComponentAspect, ImporterAspect];
  static runtime = MainRuntime;

  static async provider([workspace, cli, loggerMain, componentAspect, importerMain]: [
    Workspace,
    CLIMain,
    LoggerMain,
    ComponentMain,
    ImporterMain
  ]) {
    const logger = loggerMain.createLogger(RemoveAspect.id);
    const removeMain = new RemoveMain(workspace, logger, importerMain);
    componentAspect.registerShowFragments([new RemoveFragment(removeMain)]);
    cli.register(new RemoveCmd(removeMain), new RecoverCmd(removeMain));
    return removeMain;
  }
}

RemoveAspect.addRuntime(RemoveMain);

export default RemoveMain;
