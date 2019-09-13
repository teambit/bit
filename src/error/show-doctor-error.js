/** @flow */
import AbstractError from './abstract-error';

export default class ShowDoctorError extends AbstractError {
  msg: string;
  showDoctorMessage: boolean;

  constructor(msg: string) {
    super();
    this.msg = msg;
    this.showDoctorMessage = true;
  }
}
