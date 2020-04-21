import AbstractError from 'bit-bin/dist/error/abstract-error';

export default class InvalidConfigFile extends AbstractError {
  path: string;
  showDoctorMessage: boolean;

  constructor(path: string) {
    super();
    this.path = path;
    this.showDoctorMessage = true;
  }
}
