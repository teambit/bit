import execa from 'execa';
import { IsolatorExtension, Capsule } from '../isolator';
import { Scope } from '../../scope';
import { LogPublisher } from '../types';
import { loadConsumer } from '../../consumer';
import { BitId, BitIds } from '../../bit-id';
import { ComponentID } from '../component';
import { PublishPostExportResult } from '../../scope/component-ops/publish-during-export';
import GeneralError from '../../error/general-error';

export type PublisherOptions = {
  dryRun?: boolean;
  allowStaged?: boolean;
};

export type PublishResult = { id: ComponentID; data?: string; errors: string[] };

export class Publisher {
  packageManager = 'npm'; // @todo: decide if this is mandatory or using the workspace settings
  constructor(
    private isolator: IsolatorExtension,
    private logger: LogPublisher,
    private scope: Scope,
    private options: PublisherOptions = {}
  ) {}

  async publish(componentIds: string[], options: PublisherOptions): Promise<PublishResult[]> {
    this.options = options;
    const capsules = await this.getComponentCapsules(componentIds);
    const resultsP = capsules.map(capsule => this.publishOneCapsule(capsule, options));
    return Promise.all(resultsP);
  }

  async postExportListener(ids: BitId[]): Promise<PublishPostExportResult[]> {
    const componentIds = ids.map(id => id.toString());
    const components = await this.publish(componentIds, {});
    return components.map(c => ({
      id: c.id instanceof BitId ? c.id : c.id.legacyComponentId,
      data: c.data,
      errors: c.errors as string[]
    }));
  }

  private async publishOneCapsule(capsule: Capsule, options: PublisherOptions): Promise<PublishResult> {
    const publishParams = ['publish'];
    if (options.dryRun) publishParams.push('--dry-run');
    const publishParamsStr = publishParams.join(' ');
    const cwd = capsule.path;
    const componentIdStr = capsule.id.toString();
    const errors: string[] = [];
    let data;
    try {
      // @todo: once capsule.exec works properly, replace this
      const { stdout, stderr } = await execa(this.packageManager, publishParams, { cwd });
      this.logger.debug(componentIdStr, `successfully ran ${this.packageManager} ${publishParamsStr} at ${cwd}`);
      this.logger.debug(componentIdStr, `stdout: ${stdout}`);
      this.logger.debug(componentIdStr, `stderr: ${stderr}`);
      data = stdout;
    } catch (err) {
      const errorMsg = `failed running ${this.packageManager} ${publishParamsStr} at ${cwd}`;
      this.logger.error(errorMsg);
      this.logger.error(err.stderr);
      errors.push(`${errorMsg}\n${err.stderr}`);
    }
    return { id: capsule.component.id, data, errors };
  }

  private async getComponentCapsules(componentIds: string[]): Promise<Capsule[]> {
    // @todo hack alert!
    // currently, when loading a component from the model, it doesn't load the extension
    // as such, the package json value such as the main-file is not loaded from the env.
    // change it back to `createNetworkFromScope` once Gilad fixes it.
    const consumer = await loadConsumer();
    if (consumer.isLegacy) {
      // publish is supported on Harmony only
      return [];
    }
    // const network = await this.isolator.createNetworkFromScope(componentIds, this.scope);
    const idsToPublish = await this.getIdsToPublish(componentIds);
    const network = await this.isolator.createNetworkFromConsumer(idsToPublish, consumer);
    return network.seedersCapsules;
  }

  /**
   * only components that use pkg extension and configure "publishConfig" with their own registry
   * should be published. ignore the rest.
   */
  private async getIdsToPublish(componentIds: string[]): Promise<string[]> {
    const bitIds = await Promise.all(componentIds.map(id => this.scope.getParsedId(id)));
    await this.throwForNonStagedOrTaggedComponents(bitIds);
    const ids = BitIds.fromArray(bitIds);
    const components = await this.scope.getComponentsAndVersions(ids, true);
    return components
      .filter(c => {
        const ext = c.version.extensions.findExtension('@teambit/pkg');
        if (!ext) return false;
        return ext.config?.packageJson?.publishConfig;
      })
      .map(c =>
        c.component
          .toBitId()
          .changeVersion(c.versionStr)
          .toString()
      );
  }

  private async throwForNonStagedOrTaggedComponents(bitIds: BitId[]) {
    const idsWithoutScope = bitIds.filter(id => !id.hasScope());
    if (!idsWithoutScope.length) return;
    if (!this.options.allowStaged) {
      throw new GeneralError(
        `unable to publish the following component(s), please make sure they are exported: ${idsWithoutScope.join(
          ', '
        )}`
      );
    }
    const missingFromScope: BitId[] = [];
    await Promise.all(
      idsWithoutScope.map(async id => {
        const inScope = await this.scope.isComponentInScope(id);
        if (!inScope) {
          missingFromScope.push(id);
        }
      })
    );
    if (missingFromScope.length) {
      throw new GeneralError(
        `unable to publish the following component(s), please make sure they are not new: ${missingFromScope.join(
          ', '
        )}`
      );
    }
  }
}
