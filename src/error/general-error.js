/** @flow */
import AbstractError from './abstract-error';

export default class GeneralError extends AbstractError {
  msg: string;
  showDoctorMessage: boolean;

  constructor(msg: string) {
    super();
    this.msg = msg;
    this.showDoctorMessage = true;
  }
}
