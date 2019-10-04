import AbstractError from '../../../error/abstract-error';

export default class NetworkError extends AbstractError {
  remoteErr: string;
  showDoctorMessage: boolean;

  constructor(remoteErr: string) {
    super();
    this.remoteErr = remoteErr;
    this.showDoctorMessage = true;
  }
}
