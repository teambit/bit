import fs from 'fs-extra';
import path from 'path';
import ssri from 'ssri';
import _ from 'lodash';
import { pack } from '@pnpm/plugin-commands-publishing';
import { ComponentFactory } from '@teambit/component';
import { ComponentResult, ArtifactDefinition } from '@teambit/builder';
import { Capsule, IsolatorMain } from '@teambit/isolator';
import { isSnap } from '@teambit/component-version';
import { ScopeMain } from '@teambit/scope';
import LegacyScope from '@teambit/legacy/dist/scope/scope';
import { checksumFile } from '@teambit/legacy.utils';
import { Logger } from '@teambit/logger';
import pMap from 'p-map';
import isRelative from 'is-relative-path';

// @ts-ignore (for some reason the tsc -w not found this)
import { ScopeNotFound } from './exceptions/scope-not-found';

export type PackResult = Omit<ComponentResult, 'component'>;
export type PackResultWithId = PackResult & {
  id: string;
};

export const DEFAULT_TAR_DIR_IN_CAPSULE = 'package-tar';
const PACK_CONCURRENCY = 10;
export const TAR_FILE_ARTIFACT_NAME = 'package tar file';

export type PackResultMetadata = {
  pkgJson: Record<any, string>;
  tarPath: string;
  tarName: string;
  checksum?: string;
  integrity?: string;
};

export type PackWriteOptions = {
  outDir?: string;
  override?: boolean;
};

export type PackOptions = {
  writeOptions: PackWriteOptions;
  prefix?: boolean;
  keep?: boolean;
  loadScopeFromCache?: boolean;
  dryRun?: boolean;
};

export class Packer {
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
    // By default do not load scope from cache when packing
    const loadScopeFromCache =
      options && options.loadScopeFromCache !== undefined ? !!options.loadScopeFromCache : false;
    const legacyScope = scopePath ? await LegacyScope.load(scopePath, loadScopeFromCache) : this.scope?.legacyScope;
    if (!legacyScope) {
      throw new ScopeNotFound(scopePath);
    }
    const capsule = await this.getCapsule(componentId, legacyScope);
    const res = await this.packCapsule(capsule, options.writeOptions, options.dryRun);

    return Object.assign({}, _.omit(res, ['component']), { id: componentId });
  }

  async packMultipleCapsules(
    capsules: Capsule[],
    writeOptions: PackWriteOptions = { override: true },
    dryRun = false,
    omitFullTarPath = false
  ): Promise<ComponentResult[]> {
    // const description = `packing components${dryRun ? ' (dry-run)' : ''}`;
    const results = pMap(
      capsules,
      (capsule) => {
        return this.packCapsule(capsule, writeOptions, dryRun, omitFullTarPath);
      },
      { concurrency: PACK_CONCURRENCY }
    );
    return results;
  }

  async packCapsule(
    capsule: Capsule,
    writeOptions: PackWriteOptions = { override: true },
    dryRun = false,
    omitFullTarPath = false
  ): Promise<ComponentResult> {
    const concreteWriteOpts = writeOptions;
    // Set the package-tar as out dir to easily read the tar later
    concreteWriteOpts.outDir = concreteWriteOpts.outDir ?? DEFAULT_TAR_DIR_IN_CAPSULE;
    const packResult = await this.pnpmPack(
      capsule.path,
      concreteWriteOpts.outDir || capsule.path,
      concreteWriteOpts.override,
      dryRun
    );
    const component = capsule.component;
    const fieldsToRemove: string[] = [];
    if (omitFullTarPath) {
      fieldsToRemove.push('tarPath');
    }
    // TODO: @gilad please make sure to fix this type error now that I added lodash types
    const metadata = _(packResult.metadata).omitBy(_.isUndefined).omit(fieldsToRemove).value() as any;

    return {
      component,
      metadata,
      errors: packResult.errors,
      warnings: packResult.warnings,
      startTime: packResult.startTime,
      endTime: packResult.endTime,
    };
  }

  async pnpmPack(cwd: string, outputPath: string, override = false, dryRun = false): Promise<PackResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const pkgJson = readPackageJson(cwd);
      if (isSnap(pkgJson.version)) {
        warnings.push(`"package.json at ${cwd}" contain a snap version which is not a valid semver, can't pack it`);
        return { warnings, startTime, endTime: Date.now() };
      }
      const tgzName = await pack.handler({
        argv: { original: [] },
        dir: cwd,
        rawConfig: {},
      });
      this.logger.debug(`successfully packed tarball at ${cwd}`);
      const tgzOriginPath = path.join(cwd, tgzName);
      let tarPath = path.join(outputPath, tgzName);
      if (isRelative(tarPath)) {
        tarPath = path.join(cwd, tarPath);
      }
      const metadata: PackResultMetadata = {
        pkgJson,
        tarPath,
        tarName: tgzName,
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
      if (!dryRun) {
        const checksum = await checksumFile(tarPath);
        metadata.checksum = checksum;
        metadata.integrity = await calculateFileIntegrity(tarPath);
      }
      return { metadata, warnings, errors, startTime, endTime: Date.now() };
    } catch (err: any) {
      const errorMsg = `failed packing at ${cwd}`;
      this.logger.error(`${errorMsg}`, err);
      if (err.stderr) this.logger.error(`${err.stderr}`);
      errors.push(`${errorMsg}\n${err.stderr || err.message}`);
      return { errors, startTime, endTime: Date.now() };
    }
  }

  getArtifactDefInCapsule(outDir?: string): ArtifactDefinition {
    const rootDir = outDir || DEFAULT_TAR_DIR_IN_CAPSULE;
    const def: ArtifactDefinition = {
      name: TAR_FILE_ARTIFACT_NAME,
      globPatterns: [`${rootDir}/*.tgz`],
    };
    return def;
  }

  private async getCapsule(componentIdStr: string, legacyScope: LegacyScope): Promise<Capsule> {
    const componentId = await this.host.resolveComponentId(componentIdStr);
    const network = await this.isolator.isolateComponents([componentId], { baseDir: this.host.path }, legacyScope);
    const capsule = network.seedersCapsules.getCapsule(componentId);

    if (!capsule) throw new Error(`capsule not found for ${componentId}`);
    return capsule;
  }
}

function readPackageJson(dir: string) {
  const pkgJson = fs.readJsonSync(path.join(dir, 'package.json'));
  return pkgJson;
}

async function calculateFileIntegrity(filePath: string): Promise<string> {
  return ssri.fromData(await fs.readFile(filePath), { algorithms: ['sha512'] }).toString();
}
