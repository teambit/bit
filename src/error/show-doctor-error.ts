import GeneralError from './general-error';

export default class ShowDoctorError extends GeneralError {
  showDoctorMessage: boolean;

  constructor(msg: string) {
    super(msg);
    this.showDoctorMessage = true;
  }
}
