import type { Scope } from '@teambit/legacy.scope';
import type { ExamineResult } from './diagnosis';
import DoctorRegistrar from './doctor-registrar';
import registerCoreAndExtensionsDiagnoses from './doctor-registrar-builder';
import { setRemoteScope } from './doctor-context';
import { compact } from 'lodash';
import { logger } from '@teambit/legacy.logger';

export async function runDoctorOnScope(scope: Scope, diagnosisName?: string): Promise<ExamineResult[]> {
  registerCoreAndExtensionsDiagnoses();

  // Set the scope as remote scope so diagnoses can access it
  setRemoteScope(scope);

  try {
    const doctorRegistrar = DoctorRegistrar.getInstance();

    if (diagnosisName) {
      // Run single diagnosis
      const diagnosis = doctorRegistrar.getDiagnosisByName(diagnosisName);
      if (!diagnosis) {
        throw new Error(`Diagnosis "${diagnosisName}" not found`);
      }
      const result = await diagnosis.examine();
      return [result];
    }

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

    return compact(examineResultsWithNulls);
  } finally {
    // Clear remote scope context
    setRemoteScope(undefined);
  }
}
