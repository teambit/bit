/** @flow */

import registerCoreAndExtensionsDiagnoses from '../../../doctor/doctor-registrar-builder';
import DoctorRegistrar from '../../../doctor/doctor-registrar';
import Diagnosis from '../../../doctor/Diagnosis';
import type { ExamineResult } from '../../../doctor/Diagnosis';

// load all diagnosis
// list checks
// run all checks
// run specific check

export default (async function runAll(): Promise<ExamineResult[]> {
  registerCoreAndExtensionsDiagnoses();
  const doctorRegistrar = DoctorRegistrar.getInstance();
  const examineP = doctorRegistrar.diagnoses.map(diagnosis => diagnosis.examine());
  return Promise.all(examineP);
});

export async function listDiagnoses(): Promise<Diagnosis[]> {
  registerCoreAndExtensionsDiagnoses();
  const doctorRegistrar = DoctorRegistrar.getInstance();
  return Promise.resolve(doctorRegistrar.diagnoses);
}
