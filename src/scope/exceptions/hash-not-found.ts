import AbstractError from '../../error/abstract-error';

export default class HashNotFound extends AbstractError {
  hash: string;
  showDoctorMessage: boolean;

  constructor(hash: string) {
    super();
    this.hash = hash;
    this.showDoctorMessage = true;
  }
}
