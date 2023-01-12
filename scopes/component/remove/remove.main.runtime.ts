import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { BitId } from '@teambit/legacy-bit-id';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
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

const BEFORE_REMOVE = 'removing components';

export type RemoveInfo = {
  removed: boolean;
};

export class RemoveMain {
  constructor(private workspace: Workspace, private logger: Logger) {}

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
  static dependencies = [WorkspaceAspect, CLIAspect, LoggerAspect, ComponentAspect];
  static runtime = MainRuntime;

  static async provider([workspace, cli, loggerMain, componentAspect]: [
    Workspace,
    CLIMain,
    LoggerMain,
    ComponentMain
  ]) {
    const logger = loggerMain.createLogger(RemoveAspect.id);
    const removeMain = new RemoveMain(workspace, logger);
    componentAspect.registerShowFragments([new RemoveFragment(removeMain)]);
    cli.register(new RemoveCmd(removeMain));
    return new RemoveMain(workspace, logger);
  }
}

RemoveAspect.addRuntime(RemoveMain);

export default RemoveMain;
