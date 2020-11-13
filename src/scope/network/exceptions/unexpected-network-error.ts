import AbstractError from '../../../error/abstract-error';

export default class UnexpectedNetworkError extends AbstractError {
  message: string;
  showDoctorMessage: boolean;

  constructor(message: string) {
    super();
    this.message = message;
    // @todo: delete this hack once a new version is deployed.
    if (message.includes("warning: '_action' is not a valid command")) {
      this.message =
        'the server version is older than yours, it does not support the new four-steps export process, please update the server';
    }
    this.showDoctorMessage = true;
  }
}
