import AbstractError from '../../../error/abstract-error';

export default class SSHInvalidResponse extends AbstractError {
  response: string;
  showDoctorMessage: boolean;

  constructor(response: string) {
    super();
    this.response = response;
    this.showDoctorMessage = true;
  }
}
