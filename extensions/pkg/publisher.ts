import { Component, ComponentID } from '@teambit/component';
import { Capsule, IsolatorMain } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import { Workspace } from '@teambit/workspace';
import { BitId, BitIds } from 'bit-bin/dist/bit-id';
import { ExtensionDataList } from 'bit-bin/dist/consumer/config/extension-data';
import GeneralError from 'bit-bin/dist/error/general-error';
import { Scope } from 'bit-bin/dist/scope';
import { PublishPostExportResult } from 'bit-bin/dist/scope/component-ops/publish-during-export';
import Bluebird from 'bluebird';
import execa from 'execa';
import R from 'ramda';

export type PublisherOptions = {
  dryRun?: boolean;
  allowStaged?: boolean;
};

export type PublishResult = { id: ComponentID; data?: string; errors: string[] };

export class Publisher {
  packageManager = 'npm'; // @todo: decide if this is mandatory or using the workspace settings
  constructor(
    private isolator: IsolatorMain,
    private logger: Logger,
    private scope: Scope,
    private workspace: Workspace,
    public options: PublisherOptions = {}
  ) {}

  async publish(componentIds: string[], options: PublisherOptions): Promise<PublishResult[]> {
    // @todo: replace by `workspace.byPatter` once ready.
    if (componentIds.length === 1 && componentIds[0] === '*') {
      const all = this.workspace.consumer.bitMap.getAuthoredAndImportedBitIds();
      componentIds = all.map((id) => id.toString());
    }
    this.options = options;
    const capsules = await this.getComponentCapsules(componentIds);
    return this.publishMultipleCapsules(capsules);
  }

  async postExportListener(ids: BitId[]): Promise<PublishPostExportResult[]> {
    const componentIds = ids.map((id) => id.toString());
    const components = await this.publish(componentIds, {});
    return components.map((c) => ({
      id: c.id.legacyComponentId,
      data: c.data,
      errors: c.errors as string[],
    }));
  }

  public async publishMultipleCapsules(capsules: Capsule[]): Promise<PublishResult[]> {
    const longProcessLogger = this.logger.createLongProcessLogger('publish components', capsules.length);
    const results = Bluebird.mapSeries(capsules, (capsule) => {
      longProcessLogger.logProgress(capsule.component.id.toString());
      return this.publishOneCapsule(capsule);
    });
    longProcessLogger.end();
    return results;
  }

  private async publishOneCapsule(capsule: Capsule): Promise<PublishResult> {
    const publishParams = ['publish'];
    if (this.options.dryRun) publishParams.push('--dry-run');
    const extraArgs = this.getExtraArgsFromConfig(capsule.component);
    if (extraArgs && Array.isArray(extraArgs) && extraArgs?.length) {
      const extraArgsSplit = extraArgs.map((arg) => arg.split(' '));
      publishParams.push(...R.flatten(extraArgsSplit));
    }
    const publishParamsStr = publishParams.join(' ');
    const cwd = capsule.path;
    const componentIdStr = capsule.id.toString();
    const errors: string[] = [];
    let data;
    try {
      // @todo: once capsule.exec works properly, replace this
      const { stdout, stderr } = await execa(this.packageManager, publishParams, { cwd });
      this.logger.debug(`${componentIdStr}, successfully ran ${this.packageManager} ${publishParamsStr} at ${cwd}`);
      this.logger.debug(`${componentIdStr}, stdout: ${stdout}`);
      this.logger.debug(`${componentIdStr}, stderr: ${stderr}`);
      data = stdout;
    } catch (err) {
      const errorMsg = `failed running ${this.packageManager} ${publishParamsStr} at ${cwd}`;
      this.logger.error(`${componentIdStr}, ${errorMsg}`);
      if (err.stderr) this.logger.error(`${componentIdStr}, ${err.stderr}`);
      errors.push(`${errorMsg}\n${err.stderr}`);
    }
    const id = capsule.component.id;
    return { id, data, errors };
  }

  private async getComponentCapsules(componentIds: string[]): Promise<Capsule[]> {
    const consumer = this.workspace.consumer;
    if (consumer.isLegacy) {
      // publish is supported on Harmony only
      return [];
    }
    const idsToPublish = await this.getIdsToPublish(componentIds);
    this.logger.debug(`total ${idsToPublish.length} to publish out of ${componentIds.length}`);
    const network = await this.workspace.createNetwork(idsToPublish);
    return network.seedersCapsules;
  }

  /**
   * only components that use pkg extension and configure "publishConfig" with their own registry
   * or custom "name", should be published. ignore the rest.
   */
  private async getIdsToPublish(componentIds: string[]): Promise<string[]> {
    const bitIds = await Promise.all(componentIds.map((id) => this.scope.getParsedId(id)));
    await this.throwForNonStagedOrTaggedComponents(bitIds);
    const ids = BitIds.fromArray(bitIds);
    const components = await this.scope.getComponentsAndVersions(ids, true);
    return components
      .filter((c) => this.shouldPublish(c.version.extensions))
      .map((c) => c.component.toBitId().changeVersion(c.versionStr).toString());
  }

  public shouldPublish(extensions: ExtensionDataList): boolean {
    const pkgExt = extensions.findExtension('teambit.bit/pkg');
    if (!pkgExt) return false;
    return pkgExt.config?.packageJson?.name || pkgExt.config?.packageJson?.publishConfig;
  }

  private getExtraArgsFromConfig(component: Component): string | undefined {
    const pkgExt = component.config.extensions.findExtension('teambit.bit/pkg');
    return pkgExt?.config?.packageManagerPublishArgs;
  }

  private async throwForNonStagedOrTaggedComponents(bitIds: BitId[]) {
    const idsWithoutScope = bitIds.filter((id) => !id.hasScope());
    if (!idsWithoutScope.length) return;
    if (!this.options.allowStaged && !this.options.dryRun) {
      throw new GeneralError(
        `unable to publish the following component(s), please make sure they are exported: ${idsWithoutScope.join(
          ', '
        )}`
      );
    }
    const missingFromScope: BitId[] = [];
    await Promise.all(
      idsWithoutScope.map(async (id) => {
        const inScope = await this.scope.isComponentInScope(id);
        if (!inScope) {
          missingFromScope.push(id);
        }
      })
    );
    if (missingFromScope.length) {
      throw new GeneralError(
        `unable to publish the following component(s), please make sure they are tagged: ${missingFromScope.join(', ')}`
      );
    }
  }
}
