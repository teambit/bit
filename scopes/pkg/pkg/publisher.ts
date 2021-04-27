import { ComponentResult, TaskMetadata } from '@teambit/builder';
import { Component } from '@teambit/component';
import { Capsule, IsolatorMain } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import { Workspace } from '@teambit/workspace';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { BitId } from '@teambit/legacy-bit-id';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { BitError } from '@teambit/bit-error';
import { Scope } from '@teambit/legacy/dist/scope';
import mapSeries from 'p-map-series';
import execa from 'execa';
import R from 'ramda';
import { PkgAspect } from './pkg.aspect';

export type PublisherOptions = {
  dryRun?: boolean;
  allowStaged?: boolean;
};

export class Publisher {
  packageManager = 'npm'; // @todo: decide if this is mandatory or using the workspace settings
  constructor(
    private isolator: IsolatorMain,
    private logger: Logger,
    private scope: Scope,
    private workspace: Workspace,
    public options: PublisherOptions = {}
  ) {}

  async publish(componentIds: string[], options: PublisherOptions): Promise<ComponentResult[]> {
    // @todo: replace by `workspace.byPatter` once ready.
    if (componentIds.length === 1 && componentIds[0] === '*') {
      const all = this.workspace.consumer.bitMap.getAuthoredAndImportedBitIds();
      componentIds = all.map((id) => id.toString());
    }
    this.options = options;
    const capsules = await this.getComponentCapsules(componentIds);
    // const capsules = await this.getComponentCapsulesFromScope(componentIds);
    return this.publishMultipleCapsules(capsules);
  }

  public async publishMultipleCapsules(capsules: Capsule[]): Promise<ComponentResult[]> {
    const description = `publish components${this.options.dryRun ? ' (dry-run)' : ''}`;
    const longProcessLogger = this.logger.createLongProcessLogger(description, capsules.length);
    const results = mapSeries(capsules, (capsule) => {
      longProcessLogger.logProgress(capsule.component.id.toString());
      return this.publishOneCapsule(capsule);
    });
    longProcessLogger.end();
    return results;
  }

  private async publishOneCapsule(capsule: Capsule): Promise<ComponentResult> {
    const startTime = Date.now();
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
    let metadata: TaskMetadata = {};
    try {
      // @todo: once capsule.exec works properly, replace this
      const { stdout, stderr } = await execa(this.packageManager, publishParams, { cwd });
      this.logger.debug(`${componentIdStr}, successfully ran ${this.packageManager} ${publishParamsStr} at ${cwd}`);
      this.logger.debug(`${componentIdStr}, stdout: ${stdout}`);
      this.logger.debug(`${componentIdStr}, stderr: ${stderr}`);
      const publishedPackage = stdout.replace('+ ', ''); // npm adds "+ " prefix before the published package
      metadata = this.options.dryRun ? {} : { publishedPackage };
    } catch (err) {
      const errorMsg = `failed running ${this.packageManager} ${publishParamsStr} at ${cwd}`;
      this.logger.error(`${componentIdStr}, ${errorMsg}`);
      if (err.stderr) this.logger.error(`${componentIdStr}, ${err.stderr}`);
      errors.push(`${errorMsg}\n${err.stderr}`);
    }
    const component = capsule.component;
    return { component, metadata, errors, startTime, endTime: Date.now() };
  }

  private async getComponentCapsules(componentIds: string[]): Promise<Capsule[]> {
    const consumer = this.workspace.consumer;
    if (consumer.isLegacy) {
      // publish is supported on Harmony only
      return [];
    }
    const idsToPublish = await this.getIdsToPublish(componentIds);
    this.logger.debug(`total ${idsToPublish.length} to publish out of ${componentIds.length}`);
    const componentIdsToPublish = await this.workspace.resolveMultipleComponentIds(idsToPublish);
    const network = await this.isolator.isolateComponents(componentIdsToPublish);
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

  // TODO: consider using isPublishedToExternalRegistry from pkg.main.runtime (need to send it a component not extensions)
  public shouldPublish(extensions: ExtensionDataList): boolean {
    const pkgExt = extensions.findExtension(PkgAspect.id);
    if (!pkgExt) return false;
    return pkgExt.config?.packageJson?.name || pkgExt.config?.packageJson?.publishConfig;
  }

  private getExtraArgsFromConfig(component: Component): string | undefined {
    const pkgExt = component.config.extensions.findExtension(PkgAspect.id);
    return pkgExt?.config?.packageManagerPublishArgs;
  }

  private async throwForNonStagedOrTaggedComponents(bitIds: BitId[]) {
    const idsWithoutScope = bitIds.filter((id) => !id.hasScope());
    if (!idsWithoutScope.length) return;
    if (!this.options.allowStaged && !this.options.dryRun) {
      throw new BitError(
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
      throw new BitError(
        `unable to publish the following component(s), please make sure they are tagged: ${missingFromScope.join(', ')}`
      );
    }
  }
}
