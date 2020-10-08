import isRelative from 'is-relative-path';
import { ComponentFactory } from '@teambit/component';
import { ComponentResult, TaskMetadata, ArtifactDefinition } from '@teambit/builder';
import { Capsule, IsolatorMain } from '@teambit/isolator';
import { ScopeMain } from '@teambit/scope';
import IsolatedEnvironment from 'bit-bin/dist/environment';
import GeneralError from 'bit-bin/dist/error/general-error';
import LegacyScope from 'bit-bin/dist/scope/scope';
import execa from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { Logger } from '@teambit/logger';
import Bluebird from 'bluebird';
import { isSnap } from 'bit-bin/dist/version/version-parser';

// @ts-ignore (for some reason the tsc -w not found this)
import { ScopeNotFound } from './exceptions/scope-not-found';

export type PackResult = Omit<ComponentResult, 'component'>;
export type PackResultWithId = PackResult & {
  id: string;
};

export type PackResultMetadata = TaskMetadata & {
  pkgJson?: Record<any, string>;
  tarPath?: string;
};

export type PackWriteOptions = {
  outDir?: string;
  override?: boolean;
};

export type PackOptions = {
  writeOptions: PackWriteOptions;
  prefix?: boolean;
  keep?: boolean;
  useCapsule?: boolean;
  loadScopeFromCache?: boolean;
};

const DEFAULT_TAR_DIR_IN_CAPSULE = 'package-tar';

export class Packer {
  options: PackOptions;
  constructor(
    private isolator: IsolatorMain,
    private logger: Logger,
    private host: ComponentFactory,
    private scope?: ScopeMain
  ) {}

  async packComponent(
    componentId: string,
    scopePath: string | undefined,
    options: PackOptions
  ): Promise<PackResultWithId> {
    this.options = options;
    // By default do not load scope from cache when packing
    const loadScopeFromCache =
      options && options.loadScopeFromCache !== undefined ? !!options.loadScopeFromCache : false;
    const legacyScope = scopePath ? await LegacyScope.load(scopePath, loadScopeFromCache) : this.scope?.legacyScope;
    if (!legacyScope) {
      throw new ScopeNotFound(scopePath);
    }
    // For harmony scopes always use capsule
    if (this.options.useCapsule || !legacyScope.isLegacy || (!scopePath && !this.host.isLegacy)) {
      const res = await this.packUsingCapsule(componentId, legacyScope, options.writeOptions);
      return Object.assign({}, res, { id: componentId });
    }

    const res = await this.packLegacy(componentId, legacyScope, options.writeOptions);
    return Object.assign({}, res, { id: componentId });
  }

  async packMultipleCapsules(
    capsules: Capsule[],
    writeOptions: PackWriteOptions,
    dryRun = false
  ): Promise<ComponentResult[]> {
    const description = `packing components${dryRun ? ' (dry-run)' : ''}`;
    const longProcessLogger = this.logger.createLongProcessLogger(description, capsules.length);
    const results = Bluebird.mapSeries(capsules, (capsule) => {
      longProcessLogger.logProgress(capsule.component.id.toString());
      return this.packCapsule(capsule, writeOptions, dryRun);
    });
    longProcessLogger.end();
    return results;
  }

  async packCapsule(capsule: Capsule, writeOptions: PackWriteOptions, dryRun = false): Promise<ComponentResult> {
    const concreteWriteOpts = writeOptions;
    // Set the package-tar as out dir to easily read the tar later
    concreteWriteOpts.outDir = concreteWriteOpts.outDir ?? DEFAULT_TAR_DIR_IN_CAPSULE;
    const packResult = await runNpmPack(capsule.path, writeOptions, dryRun, this.logger);
    const component = capsule.component;
    return {
      component,
      metadata: packResult.metadata,
      errors: packResult.errors,
      startTime: packResult.startTime,
      endTime: packResult.endTime,
    };
  }

  getArtifactDefInCapsule(outDir?: string): ArtifactDefinition {
    const rootDir = outDir || DEFAULT_TAR_DIR_IN_CAPSULE;
    const def: ArtifactDefinition = {
      name: 'package tar file',
      globPatterns: [`${rootDir}/*.tgz`],
    };
    return def;
  }

  private async packLegacy(
    componentId: string,
    scope: LegacyScope,
    writeOptions: PackWriteOptions
  ): Promise<PackResult> {
    const isolatedEnvironment = new IsolatedEnvironment(scope, undefined);
    await isolatedEnvironment.create();
    const isolatePath = isolatedEnvironment.path;
    const isolateOpts = {
      writeBitDependencies: true,
      createNpmLinkFiles: true,
      installPackages: false,
      noPackageJson: false,
      excludeRegistryPrefix: !this.options.prefix,
      saveDependenciesAsComponents: false,
    };
    await isolatedEnvironment.isolateComponent(componentId, isolateOpts);
    const packResult = await runNpmPack(isolatePath, writeOptions, false, this.logger);
    if (!this.options.keep) {
      await isolatedEnvironment.destroy();
    }
    return packResult;
  }

  private async packUsingCapsule(
    componentIdStr: string,
    legacyScope: LegacyScope,
    writeOptions: PackWriteOptions
  ): Promise<PackResult> {
    const componentId = await this.host.resolveComponentId(componentIdStr);
    const component = await this.host.get(componentId);
    if (!component) {
      throw new GeneralError(`unable to find "${componentId}"`);
    }
    const capsules = await this.isolator.isolateComponents([component], { baseDir: this.host.path }, legacyScope);
    const capsule = capsules.getCapsule(componentId);

    if (!capsule) throw new Error(`capsule not found for ${componentId}`);
    return runNpmPack(capsule.path, writeOptions, false, this.logger);
  }
}

async function runNpmPack(
  rootDir: string,
  writeOptions: PackWriteOptions,
  dryRun = false,
  logger: Logger
): Promise<PackResult> {
  return npmPack(rootDir, writeOptions.outDir || rootDir, writeOptions.override, dryRun, logger);
}

function readPackageJson(dir: string) {
  const pkgJson = fs.readJsonSync(path.join(dir, 'package.json'));
  return pkgJson;
}

async function npmPack(
  cwd: string,
  outputPath: string,
  override = false,
  dryRun = false,
  logger: Logger
): Promise<PackResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const packageManager = 'npm';

  const args = ['pack'];
  if (dryRun) {
    args.push('--dry-run');
  }
  try {
    const pkgJson = readPackageJson(cwd);
    if (isSnap(pkgJson.version)) {
      warnings.push(`"package.json at ${cwd}" contain a snap version which is not a valid semver, can't pack it`);
      return { warnings, startTime, endTime: Date.now() };
    }
    // @todo: once capsule.exec works properly, replace this
    const { stdout, stderr } = await execa(packageManager, args, { cwd });
    logger.debug(`successfully ran ${packageManager} ${args} at ${cwd}`);
    logger.debug(`stdout: ${stdout}`);
    logger.debug(`stderr: ${stderr}`);
    const tgzName = stdout.trim();
    const tgzOriginPath = path.join(cwd, tgzName);
    let tarPath = path.join(outputPath, tgzName);
    if (isRelative(tarPath)) {
      tarPath = path.join(cwd, tarPath);
    }
    const metadata: PackResultMetadata = {
      pkgJson,
      tarPath,
    };
    if (tgzOriginPath !== tarPath && fs.pathExistsSync(tarPath)) {
      if (override) {
        warnings.push(`"${tarPath}" already exists, override it`);
        fs.removeSync(tarPath);
      } else {
        errors.push(`"${tarPath}" already exists, use --override flag to override`);
        return { metadata, errors, startTime, endTime: Date.now() };
      }
    }
    if (tgzOriginPath !== tarPath && !dryRun) {
      await fs.move(tgzOriginPath, tarPath);
    }
    return { metadata, warnings, errors, startTime, endTime: Date.now() };
  } catch (err) {
    const errorMsg = `failed running ${packageManager} ${args} at ${cwd}`;
    logger.error(`${errorMsg}`);
    if (err.stderr) logger.error(`${err.stderr}`);
    errors.push(`${errorMsg}\n${err.stderr}`);
    const metadata = {};
    return { metadata, errors, startTime, endTime: Date.now() };
  }
}
