import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import Stream from 'stream';
import tar from 'tar-stream';
import tarFS from 'tar-fs';
import { getBitVersion } from '@teambit/bit.get-bit-version';
import { CFG_USER_EMAIL_KEY, CFG_USER_NAME_KEY, DEBUG_LOG } from '@teambit/legacy.constants';
import { BitMap } from '@teambit/legacy.bit-map';
import { LegacyWorkspaceConfig } from '@teambit/legacy.consumer-config';
import { getWorkspaceInfo, WorkspaceInfo } from '@teambit/workspace.modules.workspace-locator';
import Diagnosis, { ExamineResult } from './diagnosis';
import DoctorRegistrar from './doctor-registrar';
import registerCoreAndExtensionsDiagnoses from './doctor-registrar-builder';
import { compact } from 'lodash';
import { removeChalkCharacters } from '@teambit/legacy.utils';
import { getExt } from '@teambit/toolbox.fs.extension-getter';
import { findScopePath } from '@teambit/scope.modules.find-scope-path';
import * as globalConfig from '@teambit/legacy.global-config';
import { getNpmVersion } from './core-diagnoses/validate-npm-exec';
import { getYarnVersion } from './core-diagnoses/validate-yarn-exec';
import { DiagnosisNotFound } from './exceptions/diagnosis-not-found';
import { MissingDiagnosisName } from './exceptions/missing-diagnosis-name';

import { DoctorAspect } from './doctor.aspect';
import { DoctorCmd } from './doctor-cmd';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import chalk from 'chalk';

// run specific check
export type DoctorMetaData = {
  nodeVersion: string;
  runningTimestamp: number;
  platform: string;
  bitVersion: string;
  npmVersion: string;
  yarnVersion: string;
  userDetails: string;
};
export type DoctorRunAllResults = {
  examineResults: ExamineResult[];
  savedFilePath: string | null | undefined;
  metaData: DoctorMetaData;
};
export type DoctorRunOneResult = {
  examineResult: ExamineResult;
  savedFilePath: string | null | undefined;
  metaData: DoctorMetaData;
};

let runningTimeStamp;

export type DoctorOptions = {
  diagnosisName?: string;
  filePath?: string;
  archiveWorkspace?: boolean;
  includeNodeModules?: boolean;
  includePublic?: boolean;
  excludeLocalScope?: boolean;
};

export class DoctorMain {
  constructor(private logger: Logger) {}

  async runAll(options: DoctorOptions): Promise<DoctorRunAllResults> {
    registerCoreAndExtensionsDiagnoses();
    runningTimeStamp = this._getTimeStamp();
    const doctorRegistrar = DoctorRegistrar.getInstance();
    const examineResultsWithNulls = await Promise.all(
      doctorRegistrar.diagnoses.map(async (diagnosis) => {
        try {
          return await diagnosis.examine();
        } catch (err: any) {
          this.logger.error(`doctor failed running diagnosis "${diagnosis.name}"`, err);
          this.logger.consoleFailure(
            chalk.red(`doctor failed running diagnosis "${diagnosis.name}".\nerror-message: ${err.message}`)
          );
        }
      })
    );
    const examineResults = compact(examineResultsWithNulls);
    const envMeta = await this._getEnvMeta();
    const savedFilePath = await this._saveExamineResultsToFile(examineResults, envMeta, options);
    return { examineResults, savedFilePath, metaData: envMeta };
  }

  async runOne({ diagnosisName, ...options }: DoctorOptions): Promise<DoctorRunOneResult> {
    if (!diagnosisName) {
      throw new MissingDiagnosisName();
    }
    registerCoreAndExtensionsDiagnoses();
    runningTimeStamp = this._getTimeStamp();
    const doctorRegistrar = DoctorRegistrar.getInstance();
    const diagnosis = doctorRegistrar.getDiagnosisByName(diagnosisName);
    if (!diagnosis) {
      throw new DiagnosisNotFound(diagnosisName);
    }
    const examineResult = await diagnosis.examine();
    const envMeta = await this._getEnvMeta();
    const savedFilePath = await this._saveExamineResultsToFile([examineResult], envMeta, options);
    return { examineResult, savedFilePath, metaData: envMeta };
  }

  async listDiagnoses(): Promise<Diagnosis[]> {
    registerCoreAndExtensionsDiagnoses();
    const doctorRegistrar = DoctorRegistrar.getInstance();
    return Promise.resolve(doctorRegistrar.diagnoses);
  }

  private async _saveExamineResultsToFile(
    examineResults: ExamineResult[],
    envMeta: DoctorMetaData,
    options: DoctorOptions
  ): Promise<string | null | undefined> {
    if (!options.filePath) {
      return Promise.resolve(undefined);
    }
    const finalFilePath = this._calculateFinalFileName(options.filePath);
    const packStream = await this._generateExamineResultsTarFile(examineResults, envMeta, finalFilePath, options);

    const yourTarball = fs.createWriteStream(finalFilePath);

    packStream.pipe(yourTarball);

    return new Promise((resolve) => {
      yourTarball.on('close', () => {
        this.logger.info(`wrote a file by bit doctor, file path: ${finalFilePath}`);
        resolve(finalFilePath);
        // fs.stat(finalFilePath, private (err, stats) {
        //   if (err) throw err
        //   console.log(stats)
        //   console.log('Got file info successfully!')
        // })
      });
    });
  }

  private getWithoutExt(filename: string): string {
    const ext = getExt(filename);
    // There is no extension just return the file name
    if (ext === filename) {
      return filename;
    }
    return filename.substring(0, filename.length - ext.length - 1); // -1 to remove the '.'
  }

  private _calculateFinalFileName(fileName: string): string {
    if (fileName === '.') {
      return this._getDefaultFileName();
    }
    let finalFileName = fileName;
    if (getExt(fileName) !== 'tar' && getExt(fileName) !== 'tar.gz') {
      finalFileName = `${this.getWithoutExt(finalFileName)}.tar`;
    }
    return finalFileName;
  }

  private _getDefaultFileName() {
    const timestamp = runningTimeStamp || this._getTimeStamp();
    return `doctor-results-${timestamp}.tar`;
  }

  // TODO: move to utils
  private _getTimeStamp() {
    const d = new Date();
    const timestamp = d.getTime();
    return timestamp;
  }

  private async _generateExamineResultsTarFile(
    examineResults: ExamineResult[],
    envMeta: DoctorMetaData,
    tarFilePath: string,
    options: DoctorOptions
  ): Promise<Stream.Readable> {
    const { archiveWorkspace, includeNodeModules, includePublic, excludeLocalScope } = options;
    const debugLog = await this._getDebugLogAsBuffer();
    const consumerInfo = await this._getWorkspaceInfo();
    let bitmap;
    if (consumerInfo && consumerInfo.path) {
      bitmap = this._getBitMap(consumerInfo.path);
    }

    const packExamineResults = async (pack) => {
      pack.entry({ name: 'env-meta.json' }, JSON.stringify(envMeta, null, 2));
      pack.entry({ name: 'doc-results.json' }, JSON.stringify(examineResults, null, 2));
      if (debugLog) {
        pack.entry({ name: 'debug.log' }, debugLog);
      }
      if (!archiveWorkspace && bitmap) {
        pack.entry({ name: '.bitmap' }, bitmap);
      }
      if (consumerInfo && consumerInfo.hasWorkspaceConfig) {
        // TODO: support new config as well
        const scopePath = findScopePath(consumerInfo.path);
        const config = scopePath ? await LegacyWorkspaceConfig.loadIfExist(consumerInfo.path, scopePath) : undefined;
        const legacyPlainConfig = config?._legacyPlainObject();
        if (legacyPlainConfig) {
          pack.entry({ name: 'config.json' }, JSON.stringify(legacyPlainConfig, null, 4));
        }
      }

      pack.finalize();

      return pack;
    };

    if (!archiveWorkspace) {
      const pack = tar.pack(); // pack is a streams2 stream
      return packExamineResults(pack);
    }

    const ignore = (fileName: string) => {
      if (fileName === tarFilePath) return true;
      if (fileName === '.DS_Store') return true;
      if (
        !includeNodeModules &&
        (fileName.startsWith(`node_modules${path.sep}`) || fileName.includes(`${path.sep}node_modules${path.sep}`))
      )
        return true;
      if (
        !includePublic &&
        (fileName.startsWith(`public${path.sep}`) || fileName.includes(`${path.sep}public${path.sep}`))
      )
        return true;
      const isGit = fileName.startsWith(`.git${path.sep}`);
      const isLocalScope =
        fileName.startsWith(`.bit${path.sep}`) || fileName.startsWith(`.git${path.sep}bit${path.sep}`);
      if (excludeLocalScope && isLocalScope) return true;
      if (isGit && !isLocalScope) return true;
      return false;
    };

    const myPack = tarFS.pack('.', {
      ignore,
      finalize: false,
      finish: packExamineResults,
    });

    return myPack;
  }

  private async _getEnvMeta(): Promise<DoctorMetaData> {
    const env = {
      nodeVersion: process.version,
      runningTimestamp: runningTimeStamp || this._getTimeStamp(),
      platform: os.platform(),
      bitVersion: getBitVersion(),
      npmVersion: await getNpmVersion(),
      yarnVersion: await getYarnVersion(),
      userDetails: this._getUserDetails(),
    };

    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return env;
  }

  private _getUserDetails(): string {
    const name = globalConfig.getSync(CFG_USER_NAME_KEY) || '';
    const email = globalConfig.getSync(CFG_USER_EMAIL_KEY) || '';
    return `${name}<${email}>`;
  }

  private async _getDebugLogAsBuffer(): Promise<Buffer | null | undefined> {
    const exists = await fs.pathExists(DEBUG_LOG);
    if (!exists) return null;
    const log = await fs.readFile(DEBUG_LOG, 'utf-8');
    const logWithoutChalk = removeChalkCharacters(log) as string;
    return Buffer.from(logWithoutChalk);
  }

  private async _getWorkspaceInfo(): Promise<WorkspaceInfo | null | undefined> {
    const consumerInfo = await getWorkspaceInfo(process.cwd());
    return consumerInfo;
  }

  private _getBitMap(workspaceDir): Buffer | null | undefined {
    return BitMap.loadRawSync(workspaceDir);
  }

  static slots = [];
  static dependencies = [CLIAspect, LoggerAspect];
  static runtime = MainRuntime;
  static async provider([cliMain, loggerMain]: [CLIMain, LoggerMain]) {
    const logger = loggerMain.createLogger(DoctorAspect.id);
    const doctor = new DoctorMain(logger);
    cliMain.register(new DoctorCmd(doctor));
    return doctor;
  }
}

DoctorAspect.addRuntime(DoctorMain);

export default DoctorMain;
