/** @flow */
import GeneralError from './general-error';

export default class ShowDoctorError extends GeneralError {
  msg: string;
  showDoctorMessage: boolean;

  constructor(msg: string) {
    super(msg);
    this.showDoctorMessage = true;
  }
}
