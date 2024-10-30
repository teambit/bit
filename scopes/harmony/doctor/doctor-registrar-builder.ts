import BrokenSymlinkFiles from './core-diagnoses/broken-symlink-files';
import OrphanSymlinkObjects from './core-diagnoses/orphan-symlink-objects';
import ValidateBitVersion from './core-diagnoses/validate-bit-version';
import ValidateGitExec from './core-diagnoses/validate-git-exec';
import ValidateNpmExec from './core-diagnoses/validate-npm-exec';
import ValidateWorkspaceBitJsonSyntax from './core-diagnoses/validate-workspace-bit-json-syntax';
import ValidateYarnExec from './core-diagnoses/validate-yarn-exec';
import Diagnosis from './diagnosis';
import DoctorRegistrar from './doctor-registrar';

export default function registerCoreAndExtensionsDiagnoses(extensionDiagnoses: Diagnosis[] = []) {
  const diagnoses = [
    new ValidateWorkspaceBitJsonSyntax(),
    new ValidateGitExec(),
    new OrphanSymlinkObjects(),
    new BrokenSymlinkFiles(),
    new ValidateNpmExec(),
    new ValidateYarnExec(),
    new ValidateBitVersion(),
  ].concat(extensionDiagnoses);
  DoctorRegistrar.init(diagnoses);
}
