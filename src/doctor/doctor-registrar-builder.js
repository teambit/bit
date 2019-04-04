/** @flow */

import DoctorRegistrar from './doctor-registrar';
import Diagnosis from './diagnosis';
import ValidateWorkspaceBitJsonSyntax from './core-diagnoses/validate-workspace-bit-json-syntax';
import ValidateGitExe from './core-diagnoses/validate-git-exe';

export default function registerCoreAndExtensionsDiagnoses(extensionDiagnoses: Diagnosis[] = []) {
  const diagnoses = [new ValidateWorkspaceBitJsonSyntax(), new ValidateGitExe()].concat(extensionDiagnoses);
  DoctorRegistrar.init(diagnoses);
}
