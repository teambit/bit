import execa from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { isSnap } from '@teambit/component-version';
import isRelative from 'is-relative-path';
import { checksumFile } from '../utils';
import IsolatedEnvironment from '../environment';
import defaultLogger, { IBitLogger } from '../logger/logger';
import Scope from '../scope/scope';

export type PackResultMetadata = {
  pkgJson: Record<any, string>;
  tarPath: string;
  tarName: string;
  checksum?: string;
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

export type PackResult = {
  /**
   * metadata generated during component build.
   */
  metadata?: PackResultMetadata;

  /**
   * returning errors from build tasks will cause a pipeline failure and logs all returned errors.
   */
  errors?: Array<Error | string>;

  /**
   * warnings generated throughout the build task.
   */
  warnings?: string[];

  /**
   * timestamp in milliseconds when the task started
   */
  startTime?: number;

  /**
   * timestamp in milliseconds when the task ended
   */
  endTime?: number;
};

export class Packer {
  constructor(private logger: IBitLogger = defaultLogger) {}

  async packByScopePath(componentId: string, scopePath: string, options: PackOptions): Promise<PackResult> {
    const scope = await Scope.load(scopePath, options.loadScopeFromCache);
    return this.pack(componentId, scope, options);
  }

  async pack(componentId: string, scope: Scope, options: PackOptions): Promise<PackResult> {
    const isolatedEnvironment = new IsolatedEnvironment(scope, undefined);
    await isolatedEnvironment.create();
    const isolatePath = isolatedEnvironment.path;
    const isolateOpts = {
      writeBitDependencies: true,
      createNpmLinkFiles: true,
      installPackages: false,
      noPackageJson: false,
      excludeRegistryPrefix: !options.prefix,
      saveDependenciesAsComponents: false,
    };
    await isolatedEnvironment.isolateComponent(componentId, isolateOpts);
    const packResult = this.npmPack(
      isolatePath,
      options.writeOptions.outDir || isolatePath,
      options.writeOptions.override,
      options.dryRun
    );
    if (!options.keep) {
      await isolatedEnvironment.destroy();
    }
    return packResult;
  }

  async npmPack(
    cwd: string,
    outputPath: string,
    override = false,
    dryRun = false,
    logger = this.logger
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
      }
      return { metadata, warnings, errors, startTime, endTime: Date.now() };
    } catch (err) {
      const errorMsg = `failed running ${packageManager} ${args} at ${cwd}`;
      logger.error(`${errorMsg}`);
      if (err.stderr) logger.error(`${err.stderr}`);
      errors.push(`${errorMsg}\n${err.stderr}`);
      return { errors, startTime, endTime: Date.now() };
    }
  }
}

function readPackageJson(dir: string) {
  const pkgJson = fs.readJsonSync(path.join(dir, 'package.json'));
  return pkgJson;
}
