import { ComponentResult, TaskMetadata } from '@teambit/builder';
import { Component, ComponentID } from '@teambit/component';
import { Capsule, IsolatorMain } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import { Workspace } from '@teambit/workspace';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { BitError } from '@teambit/bit-error';
import { Scope } from '@teambit/legacy/dist/scope';
import fsx from 'fs-extra';
import mapSeries from 'p-map-series';
import execa from 'execa';
import { PkgAspect } from './pkg.aspect';
import { PkgExtensionConfig } from './pkg.main.runtime';

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

  async publish(componentPattern: string, options: PublisherOptions): Promise<ComponentResult[]> {
    const componentIds = await this.workspace.idsByPattern(componentPattern);
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
    publishParams.push(...this.getTagFlagForPreRelease(capsule.component.id));
    const extraArgs = this.getExtraArgsFromConfig(capsule.component);
    if (extraArgs && Array.isArray(extraArgs) && extraArgs?.length) {
      const extraArgsSplit = extraArgs.map((arg) => arg.split(' ')).flat();
      publishParams.push(...extraArgsSplit);
    }
    const publishParamsStr = publishParams.join(' ');
    const cwd = capsule.path;
    const componentIdStr = capsule.id.toString();
    const errors: string[] = [];
    let metadata: TaskMetadata = {};
    try {
      this.logger.off();
      // @todo: once capsule.exec works properly, replace this
      // It is important to use stdio: 'inherit' so when npm asks for the OTP, the user can enter it
      await execa(this.packageManager, publishParams, { cwd, stdio: 'inherit' });
      this.logger.on();
      this.logger.debug(`${componentIdStr}, successfully ran ${this.packageManager} ${publishParamsStr} at ${cwd}`);
      const pkg = await fsx.readJSON(`${capsule.path}/package.json`);
      metadata = this.options.dryRun ? {} : { publishedPackage: `${pkg.name}@${pkg.version}` };
    } catch (err: any) {
      const errorMsg = `failed running ${this.packageManager} ${publishParamsStr} at ${cwd}`;
      this.logger.error(`${componentIdStr}, ${errorMsg}`);
      errors.push(errorMsg);
    }
    const component = capsule.component;
    return { component, metadata, errors, startTime, endTime: Date.now() };
  }

  private getTagFlagForPreRelease(id: ComponentID): string[] {
    const preReleaseData = id.getVersionPreReleaseData();
    if (!preReleaseData) return [];
    const maybeIdentifier = preReleaseData[0]; // it can be numeric as in 1.0.0-0.
    if (typeof maybeIdentifier !== 'string') return [];
    return ['--tag', maybeIdentifier];
  }

  private async getComponentCapsules(componentIds: ComponentID[]): Promise<Capsule[]> {
    const idsToPublish = await this.getIdsToPublish(componentIds);
    this.logger.debug(`total ${idsToPublish.length} to publish out of ${componentIds.length}`);
    const componentIdsToPublish = await this.workspace.resolveMultipleComponentIds(idsToPublish);
    const network = await this.isolator.isolateComponents(componentIdsToPublish, {
      packageManagerConfigRootDir: this.workspace.path,
    });
    return network.seedersCapsules;
  }

  /**
   * only components that use pkg extension and configure "publishConfig" with their own registry
   * or custom "name", should be published. ignore the rest.
   */
  private async getIdsToPublish(componentIds: ComponentID[]): Promise<string[]> {
    await this.throwForNonStagedOrTaggedComponents(componentIds);
    const ids = BitIds.fromArray(componentIds.map((compId) => compId._legacy));
    const components = await this.scope.getComponentsAndVersions(ids, true);
    return components
      .filter((c) => this.shouldPublish(c.version.extensions))
      .map((c) => c.component.toBitId().changeVersion(c.versionStr).toString());
  }

  // TODO: consider using isPublishedToExternalRegistry from pkg.main.runtime (need to send it a component not extensions)
  public shouldPublish(extensions: ExtensionDataList): boolean {
    const pkgExt = extensions.findExtension(PkgAspect.id);
    if (!pkgExt) return false;
    const config = pkgExt.config as PkgExtensionConfig;
    if (config?.avoidPublishToNPM) return false;
    return config?.packageJson?.name || config?.packageJson?.publishConfig;
  }

  private getExtraArgsFromConfig(component: Component): string | undefined {
    const pkgExt = component.config.extensions.findExtension(PkgAspect.id);
    return pkgExt?.config?.packageManagerPublishArgs;
  }

  private async throwForNonStagedOrTaggedComponents(componentIds: ComponentID[]) {
    const idsWithoutScope = componentIds.filter((id) => !id._legacy.hasScope());
    if (!idsWithoutScope.length) return;
    if (!this.options.allowStaged && !this.options.dryRun) {
      throw new BitError(
        `unable to publish the following component(s), please make sure they are exported: ${idsWithoutScope.join(
          ', '
        )}`
      );
    }
    const missingFromScope: ComponentID[] = [];
    await Promise.all(
      idsWithoutScope.map(async (id) => {
        const inScope = await this.scope.isComponentInScope(id._legacy);
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
