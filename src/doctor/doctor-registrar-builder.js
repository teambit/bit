/** @flow */

import DoctorRegistrar from './doctor-registrar';
import Diagnosis from './diagnosis';
import ValidateWorkspaceBitJsonSyntax from './core-diagnoses/validate-workspace-bit-json-syntax';
import ValidateGitExe from './core-diagnoses/validate-git-exe';
import OrphanSymlinkObjects from './core-diagnoses/orphan-symlink-objects';
import BrokenSymlinkFiles from './core-diagnoses/broken-symlink-files';
import ValidateYarnExec from './core-diagnoses/validate-yarn-exec';

export default function registerCoreAndExtensionsDiagnoses(extensionDiagnoses: Diagnosis[] = []) {
  const diagnoses = [
    new ValidateWorkspaceBitJsonSyntax(),
    new ValidateGitExe(),
    new OrphanSymlinkObjects(),
    new BrokenSymlinkFiles(),
    new ValidateYarnExec()
  ].concat(extensionDiagnoses);
  DoctorRegistrar.init(diagnoses);
}
