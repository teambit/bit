import fs from 'fs-extra';
import os from 'os';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import Stream from 'stream';
import path from 'path';
import tar from 'tar-stream';
import tarFS from 'tar-fs';
import { getHarmonyVersion } from '../../../bootstrap';

import { CFG_USER_EMAIL_KEY, CFG_USER_NAME_KEY, DEBUG_LOG } from '../../../constants';
import BitMap from '../../../consumer/bit-map';
import WorkspaceConfig from '../../../consumer/config/workspace-config';
import { ConsumerInfo, getConsumerInfo } from '../../../consumer/consumer-locator';
import Diagnosis, { ExamineResult } from '../../../doctor/diagnosis';
import DoctorRegistrar from '../../../doctor/doctor-registrar';
import registerCoreAndExtensionsDiagnoses from '../../../doctor/doctor-registrar-builder';
import logger from '../../../logger/logger';
import npmClient from '../../../npm-client';
import { getExt, getWithoutExt, removeChalkCharacters } from '../../../utils';
import DiagnosisNotFound from './exceptions/diagnosis-not-found';
import MissingDiagnosisName from './exceptions/missing-diagnosis-name';
import * as globalConfig from './global-config';

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

export default async function runAll({
  filePath,
  archiveWorkspace,
}: {
  filePath?: string;
  archiveWorkspace?: boolean;
}): Promise<DoctorRunAllResults> {
  registerCoreAndExtensionsDiagnoses();
  runningTimeStamp = _getTimeStamp();
  const doctorRegistrar = DoctorRegistrar.getInstance();
  const examineP = doctorRegistrar.diagnoses.map((diagnosis) => diagnosis.examine());
  const examineResults = await Promise.all(examineP);
  const envMeta = await _getEnvMeta();
  const savedFilePath = await _saveExamineResultsToFile(examineResults, envMeta, filePath, archiveWorkspace);
  return { examineResults, savedFilePath, metaData: envMeta };
}

export async function runOne({
  diagnosisName,
  filePath,
  archiveWorkspace = false,
}: {
  diagnosisName: string;
  filePath?: string;
  archiveWorkspace?: boolean;
}): Promise<DoctorRunOneResult> {
  if (!diagnosisName) {
    throw new MissingDiagnosisName();
  }
  registerCoreAndExtensionsDiagnoses();
  runningTimeStamp = _getTimeStamp();
  const doctorRegistrar = DoctorRegistrar.getInstance();
  const diagnosis = doctorRegistrar.getDiagnosisByName(diagnosisName);
  if (!diagnosis) {
    throw new DiagnosisNotFound(diagnosisName);
  }
  const examineResult = await diagnosis.examine();
  const envMeta = await _getEnvMeta();
  const savedFilePath = await _saveExamineResultsToFile([examineResult], envMeta, filePath, archiveWorkspace);
  return { examineResult, savedFilePath, metaData: envMeta };
}

export async function listDiagnoses(): Promise<Diagnosis[]> {
  registerCoreAndExtensionsDiagnoses();
  const doctorRegistrar = DoctorRegistrar.getInstance();
  return Promise.resolve(doctorRegistrar.diagnoses);
}

async function _saveExamineResultsToFile(
  examineResults: ExamineResult[],
  envMeta: DoctorMetaData,
  filePath: string | null | undefined,
  archiveWorkspace = false
): Promise<string | null | undefined> {
  if (!filePath) {
    return Promise.resolve(undefined);
  }
  const finalFilePath = _calculateFinalFileName(filePath);
  const packStream = await _generateExamineResultsTarFile(examineResults, envMeta, archiveWorkspace, finalFilePath);

  const yourTarball = fs.createWriteStream(finalFilePath);

  packStream.pipe(yourTarball);

  return new Promise((resolve) => {
    yourTarball.on('close', function () {
      logger.info(`wrote a file by bit doctor, file path: ${finalFilePath}`);
      resolve(finalFilePath);
      // fs.stat(finalFilePath, function (err, stats) {
      //   if (err) throw err
      //   console.log(stats)
      //   console.log('Got file info successfully!')
      // })
    });
  });
}

function _calculateFinalFileName(fileName: string): string {
  if (fileName === '.') {
    return _getDefaultFileName();
  }
  let finalFileName = fileName;
  if (getExt(fileName) !== 'tar' && getExt(fileName) !== 'tar.gz') {
    finalFileName = `${getWithoutExt(finalFileName)}.tar`;
  }
  return finalFileName;
}

function _getDefaultFileName() {
  const timestamp = runningTimeStamp || _getTimeStamp();
  return `doctor-results-${timestamp}.tar`;
}

// TODO: move to utils
function _getTimeStamp() {
  const d = new Date();
  const timestamp = d.getTime();
  return timestamp;
}

async function _generateExamineResultsTarFile(
  examineResults: ExamineResult[],
  envMeta: DoctorMetaData,
  archiveWorkspace = false,
  tarFilePath: string
): Promise<Stream.Readable> {
  const debugLog = await _getDebugLogAsBuffer();
  const consumerInfo = await _getConsumerInfo();
  let bitmap;
  if (consumerInfo && consumerInfo.path) {
    bitmap = _getBitMap(consumerInfo.path);
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
    if (consumerInfo && consumerInfo.hasConsumerConfig) {
      // TODO: support new config as well
      const config = await WorkspaceConfig.loadIfExist(consumerInfo.path);
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

  const myPack = tarFS.pack('.', {
    ignore: (name) => {
      return name.startsWith(`node_modules${path.sep}`) || name === tarFilePath;
    },
    finalize: false,
    finish: packExamineResults,
  });

  return myPack;
}

async function _getEnvMeta(): Promise<DoctorMetaData> {
  const env = {
    nodeVersion: process.version,
    runningTimestamp: runningTimeStamp || _getTimeStamp(),
    platform: os.platform(),
    bitVersion: getHarmonyVersion(),
    npmVersion: await npmClient.getNpmVersion(),
    yarnVersion: await npmClient.getYarnVersion(),
    userDetails: _getUserDetails(),
  };

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return env;
}

function _getUserDetails(): string {
  const name = globalConfig.getSync(CFG_USER_NAME_KEY) || '';
  const email = globalConfig.getSync(CFG_USER_EMAIL_KEY) || '';
  return `${name}<${email}>`;
}

async function _getDebugLogAsBuffer(): Promise<Buffer | null | undefined> {
  const exists = await fs.pathExists(DEBUG_LOG);
  if (!exists) return null;
  const log = await fs.readFile(DEBUG_LOG, 'utf-8');
  const logWithoutChalk = removeChalkCharacters(log) as string;
  return Buffer.from(logWithoutChalk);
}

async function _getConsumerInfo(): Promise<ConsumerInfo | null | undefined> {
  const consumerInfo = await getConsumerInfo(process.cwd());
  return consumerInfo;
}

function _getBitMap(workspaceDir): Buffer | null | undefined {
  return BitMap.loadRawSync(workspaceDir);
}
