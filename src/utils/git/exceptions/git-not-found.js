/** @flow */
import AbstractError from '../../../error/abstract-error';

export default class GitNotFound extends AbstractError {
  gitExecutablePath: string;
  err: Error;
  showDoctorMessage: boolean;
  constructor(gitExecutablePath: string, err: Error) {
    super();
    this.err = err;
    this.showDoctorMessage = true;
  }
}
