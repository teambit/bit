import AbstractError from '../../../error/abstract-error';

export default class AuthenticationFailed extends AbstractError {
  debugInfo: string;
  showDoctorMessage: boolean;

  constructor(debugInfo: string) {
    super();
    this.debugInfo = debugInfo;
    this.showDoctorMessage = true;
  }
}
