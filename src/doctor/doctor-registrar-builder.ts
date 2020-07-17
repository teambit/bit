import DoctorRegistrar from './doctor-registrar';
import Diagnosis from './diagnosis';
import ValidateWorkspaceBitJsonSyntax from './core-diagnoses/validate-workspace-bit-json-syntax';
import ValidateGitExec from './core-diagnoses/validate-git-exec';
import OrphanSymlinkObjects from './core-diagnoses/orphan-symlink-objects';
import BrokenSymlinkFiles from './core-diagnoses/broken-symlink-files';
import ValidateNpmExec from './core-diagnoses/validate-npm-exec';
import ValidateYarnExec from './core-diagnoses/validate-yarn-exec';
import ValidateBitVersion from './core-diagnoses/validate-bit-version';

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
