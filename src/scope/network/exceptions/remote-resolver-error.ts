import AbstractError from '../../../error/abstract-error';

export default class RemoteResolverError extends AbstractError {
  message: string;
  showDoctorMessage: boolean;

  constructor(message: string) {
    super();
    this.message = message;
    this.showDoctorMessage = true;
  }
}
