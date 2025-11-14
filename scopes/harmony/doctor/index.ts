import { DoctorAspect } from './doctor.aspect';

export type { DoctorMain, DoctorMetaData, DoctorResponse } from './doctor.main.runtime';
export type { ExamineResult } from './diagnosis';
export { DiagnosisNotFound } from './exceptions/diagnosis-not-found';
export { DIAGNOSIS_NAME_VALIDATE_GIT_EXEC } from './core-diagnoses/validate-git-exec';
export { runDoctorOnScope } from './run-doctor-on-scope';
export default DoctorAspect;
export { DoctorAspect };
