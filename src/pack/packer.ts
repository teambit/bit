import fs from 'fs-extra';
import path from 'path';
import ssri from 'ssri';
import { pack } from '@pnpm/plugin-commands-publishing';
import { isSnap } from '@teambit/component-version';
import isRelative from 'is-relative-path';
import { checksumFile } from '../utils';
import defaultLogger, { IBitLogger } from '../logger/logger';

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
      logger.debug(`successfully packed tarball at ${cwd}`);
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
      logger.error(`${errorMsg}`, err);
      if (err.stderr) logger.error(`${err.stderr}`);
      errors.push(`${errorMsg}\n${err.stderr || err.message}`);
      return { errors, startTime, endTime: Date.now() };
    }
  }
}

async function calculateFileIntegrity(filePath: string): Promise<string> {
  return ssri.fromData(await fs.readFile(filePath), { algorithms: ['sha512'] }).toString();
}

function readPackageJson(dir: string) {
  const pkgJson = fs.readJsonSync(path.join(dir, 'package.json'));
  return pkgJson;
}
