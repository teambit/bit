import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { BitId } from '@teambit/legacy-bit-id';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import removeComponents from '@teambit/legacy/dist/consumer/component-ops/remove-components';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import hasWildcard from '@teambit/legacy/dist/utils/string/has-wildcard';
import { getRemoteBitIdsByWildcards } from '@teambit/legacy/dist/api/consumer/lib/list-scope';
import { ComponentID } from '@teambit/component-id';
import deleteComponentsFiles from '@teambit/legacy/dist/consumer/component-ops/delete-component-files';
import { removeComponentsFromNodeModules } from '@teambit/legacy/dist/consumer/component/package-json-utils';
import { RemoveCmd } from './remove-cmd';
import { RemoveAspect } from './remove.aspect';

const BEFORE_REMOVE = 'removing components';

export class RemoveMain {
  constructor(private workspace: Workspace, private logger: Logger) {}

  async remove({
    componentsPattern,
    force,
    remote,
    track,
    deleteFiles,
  }: {
    componentsPattern: string;
    force: boolean;
    remote: boolean;
    track: boolean;
    deleteFiles: boolean;
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
    });
    if (consumer) await consumer.onDestroy();
    return removeResults;
  }

  async softRemove(componentsPattern: string): Promise<ComponentID[]> {
    if (!this.workspace) throw new ConsumerNotFound();
    const componentIds = await this.workspace.idsByPattern(componentsPattern);
    const components = await this.workspace.getMany(componentIds);
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
  static dependencies = [WorkspaceAspect, CLIAspect, LoggerAspect];
  static runtime = MainRuntime;

  static async provider([workspace, cli, loggerMain]: [Workspace, CLIMain, LoggerMain]) {
    const logger = loggerMain.createLogger(RemoveAspect.id);
    const removeMain = new RemoveMain(workspace, logger);
    cli.register(new RemoveCmd(removeMain));
    return new RemoveMain(workspace, logger);
  }
}

RemoveAspect.addRuntime(RemoveMain);

export default RemoveMain;
