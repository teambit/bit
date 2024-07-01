import { BitError } from '@teambit/bit-error';

const reportIssueToGithubMsg =
  'This error should have never happened. Please report this issue on Github https://github.com/teambit/bit/issues';

export default class ValidationError extends BitError {
  showDoctorMessage: boolean;

  constructor(msg: string) {
    super(`${msg}\n${reportIssueToGithubMsg}`);
    this.showDoctorMessage = true;
  }
}
