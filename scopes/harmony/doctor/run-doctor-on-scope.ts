import os from 'os';
import type { Scope } from '@teambit/legacy.scope';
import type { ExamineResult } from './diagnosis';
import type { DoctorResponse, DoctorMetaData } from './doctor.main.runtime';
import DoctorRegistrar from './doctor-registrar';
import registerCoreAndExtensionsDiagnoses from './doctor-registrar-builder';
import { setRemoteScope } from './doctor-context';
import { compact } from 'lodash';
import { logger } from '@teambit/legacy.logger';
import { getBitVersion } from '@teambit/bit.get-bit-version';
import { CFG_USER_EMAIL_KEY, CFG_USER_NAME_KEY } from '@teambit/legacy.constants';
import { getConfig } from '@teambit/config-store';
import { getNpmVersion } from './core-diagnoses/validate-npm-exec';
import { getYarnVersion } from './core-diagnoses/validate-yarn-exec';

export async function runDoctorOnScope(scope: Scope, diagnosisName?: string): Promise<DoctorResponse> {
  registerCoreAndExtensionsDiagnoses();

  // Set the scope as remote scope so diagnoses can access it
  setRemoteScope(scope);

  try {
    const doctorRegistrar = DoctorRegistrar.getInstance();

    let examineResults: ExamineResult[];

    if (diagnosisName) {
      // Run single diagnosis
      const diagnosis = doctorRegistrar.getDiagnosisByName(diagnosisName);
      if (!diagnosis) {
        throw new Error(`Diagnosis "${diagnosisName}" not found`);
      }
      const result = await diagnosis.examine();
      examineResults = [result];
    } else {
      // Run all diagnoses
      const examineResultsWithNulls = await Promise.all(
        doctorRegistrar.diagnoses.map(async (diagnosis) => {
          try {
            return await diagnosis.examine();
          } catch (err: any) {
            // Log error but continue with other diagnoses
            logger.error(`doctor failed running diagnosis "${diagnosis.name}"`, err);
            return null;
          }
        })
      );
      examineResults = compact(examineResultsWithNulls);
    }

    // Generate metadata for this scope
    const metaData = await getEnvMeta();

    return { examineResults, metaData };
  } finally {
    // Clear remote scope context
    setRemoteScope(undefined);
  }
}

async function getEnvMeta(): Promise<DoctorMetaData> {
  const name = getConfig(CFG_USER_NAME_KEY) || '';
  const email = getConfig(CFG_USER_EMAIL_KEY) || '';

  return {
    nodeVersion: process.version,
    runningTimestamp: Date.now(),
    platform: os.platform(),
    bitVersion: getBitVersion(),
    npmVersion: await getNpmVersion(),
    yarnVersion: await getYarnVersion(),
    userDetails: `${name}<${email}>`,
  };
}
