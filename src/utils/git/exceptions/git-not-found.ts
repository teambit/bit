import { BitError } from '@teambit/bit-error';

export default class GitNotFound extends BitError {
  gitExecutablePath: string;
  err: Error;
  showDoctorMessage: boolean;
  constructor(gitExecutablePath: string, err: Error) {
    super(
      "error: unable to run command because git executable not found. please ensure git is installed and/or git_path is configured using the 'bit config set git_path <GIT_PATH>'"
    );
    this.gitExecutablePath = gitExecutablePath;
    this.err = err;
    this.showDoctorMessage = true;
  }
}
