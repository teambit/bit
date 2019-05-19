/** @flow */

import DoctorRegistrar from './doctor-registrar';
import Diagnosis from './diagnosis';
import ValidateWorkspaceBitJsonSyntax from './core-diagnoses/validate-workspace-bit-json-syntax';
import ValidateGitExec from './core-diagnoses/validate-git-exec';
import OrphanSymlinkObjects from './core-diagnoses/orphan-symlink-objects';
import BrokenSymlinkFiles from './core-diagnoses/broken-symlink-files';

export default function registerCoreAndExtensionsDiagnoses(extensionDiagnoses: Diagnosis[] = []) {
  const diagnoses = [
    new ValidateWorkspaceBitJsonSyntax(),
    new ValidateGitExec(),
    new OrphanSymlinkObjects(),
    new BrokenSymlinkFiles()
  ].concat(extensionDiagnoses);
  DoctorRegistrar.init(diagnoses);
}
