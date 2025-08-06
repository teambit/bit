import type { ComponentResult, TaskMetadata } from '@teambit/builder';
import type { Component, ComponentID } from '@teambit/component';
import { isSnap } from '@teambit/component-version';
import type { Capsule, IsolatorMain } from '@teambit/isolator';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import { ComponentIdList } from '@teambit/component-id';
import type { ExtensionDataList } from '@teambit/legacy.extension-data';
import { BitError } from '@teambit/bit-error';
import type { Scope } from '@teambit/legacy.scope';
import fsx from 'fs-extra';
import { chunk } from 'lodash';
import { join } from 'path';
import ssri from 'ssri';
import execa from 'execa';
import { PkgAspect } from './pkg.aspect';
import type { PkgExtensionConfig } from './pkg.main.runtime';
import { DEFAULT_TAR_DIR_IN_CAPSULE } from './packer';

const PUBLISH_CONCURRENCY = 10;

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
    const longProcessLogger = this.logger.createLongProcessLogger(description, capsules.length / PUBLISH_CONCURRENCY);
    const chunks = chunk(capsules, PUBLISH_CONCURRENCY);
    const results: ComponentResult[] = [];
    for (const aChunk of chunks) {
      longProcessLogger.logProgress(aChunk.map((c) => c.component.id.toString()).join(', '));
      const chunkResults = await Promise.all(aChunk.map((capsule) => this.publishOneCapsule(capsule)));
      results.push(...chunkResults);
    }
    longProcessLogger.end();
    return results;
  }

  private async publishOneCapsule(capsule: Capsule): Promise<ComponentResult> {
    const startTime = Date.now();
    const publishParams = ['publish'];
    const tarFolderPath = join(capsule.path, DEFAULT_TAR_DIR_IN_CAPSULE);
    const files = fsx.readdirSync(tarFolderPath);
    const tarPath = files.find((file) => file.endsWith('.tgz'));
    let cwd = capsule.path;
    if (tarPath) {
      cwd = tarFolderPath;
      publishParams.push(tarPath);
    }
    publishParams.push('--quiet');
    if (this.options.dryRun) publishParams.push('--dry-run');
    publishParams.push(...this.getTagFlagForPreRelease(capsule.component.id));
    publishParams.push(...this.getTagFlagForSnap(capsule.component.id));
    const extraArgs = this.getExtraArgsFromConfig(capsule.component);
    if (extraArgs && Array.isArray(extraArgs) && extraArgs?.length) {
      const extraArgsSplit = extraArgs.map((arg) => arg.split(' ')).flat();
      publishParams.push(...extraArgsSplit);
    }
    const publishParamsStr = publishParams.join(' ');
    const getPkgJson = async () => fsx.readJSON(`${capsule.path}/package.json`);
    const componentIdStr = capsule.id.toString();
    const pkgJson = await getPkgJson();
    this.logger.console(`publishing ${pkgJson.name}@${pkgJson.version}`);
    const errors: string[] = [];
    try {
      this.logger.off();
      // @todo: once capsule.exec works properly, replace this
      // It is important to use stdio: 'inherit' so when npm asks for the OTP, the user can enter it
      await execa(this.packageManager, publishParams, { cwd, stdio: 'inherit' });
      this.logger.on();
      this.logger.debug(`${componentIdStr}, successfully ran ${this.packageManager} ${publishParamsStr} at ${cwd}`);
    } catch (err: unknown) {
      const errorDetails = typeof err === 'object' && err && 'message' in err ? err.message : err;
      const errorMsg = `failed running ${this.packageManager} ${publishParamsStr} at ${cwd}: ${errorDetails}`;
      this.logger.error(`${componentIdStr}, ${errorMsg}`);
      let isPublished = false;
      if (typeof errorDetails === 'string' && errorDetails.includes('EPERM') && tarPath) {
        // sleep 5 seconds
        await new Promise((resolve) => setTimeout(resolve, Number(process.env.NPM_WAKE_UP || 5000)));
        const integrityOnNpm = await this.getIntegrityOnNpm(pkgJson.name, pkgJson.version);
        if (integrityOnNpm && tarPath) {
          const tarData = fsx.readFileSync(join(tarFolderPath, tarPath));
          // If the integrity of the tarball in the registry matches the local one,
          // we consider the package published
          isPublished = ssri.checkData(tarData, integrityOnNpm) !== false;
          this.logger.debug(
            `${componentIdStr}, package ${pkgJson.name} is already on npm with version ${pkgJson.version}`
          );
        }
      }
      if (!isPublished) errors.push(errorMsg);
    }
    let metadata: TaskMetadata = {};
    if (errors.length === 0 && !this.options.dryRun) {
      const pkg = await fsx.readJSON(`${capsule.path}/package.json`);
      metadata = { publishedPackage: `${pkg.name}@${pkg.version}` };
    }
    const component = capsule.component;
    return { component, metadata, errors, startTime, endTime: Date.now() };
  }

  private async getIntegrityOnNpm(pkgName: string, pkgVersion: string): Promise<string | undefined> {
    const args = ['view', `${pkgName}@${pkgVersion}`, 'dist.integrity'];
    try {
      const results = await execa(this.packageManager, args);
      return results.stdout;
    } catch (err: unknown) {
      this.logger.error(`failed running ${this.packageManager} ${args.join(' ')}: ${err}`, err);
      return undefined;
    }
  }

  private getTagFlagForPreRelease(id: ComponentID): string[] {
    const preReleaseData = id.getVersionPreReleaseData();
    if (!preReleaseData) return [];
    const maybeIdentifier = preReleaseData[0]; // it can be numeric as in 1.0.0-0.
    if (typeof maybeIdentifier !== 'string') return [];
    return ['--tag', maybeIdentifier];
  }

  private getTagFlagForSnap(id: ComponentID): string[] {
    if (isSnap(id.version)) {
      const snapTag = 'snap';
      return ['--tag', snapTag];
    }
    return [];
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
    const ids = ComponentIdList.fromArray(componentIds);
    const components = await this.scope.getComponentsAndVersions(ids, true);
    return components
      .filter((c) => this.shouldPublish(c.version.extensions))
      .map((c) => c.component.toComponentId().changeVersion(c.versionStr).toString());
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
    const idsWithoutScope = componentIds.filter((id) => !this.scope.isExported(id));
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
