/** @flow */

export default class ValidationError extends Error {
  showDoctorMessage: boolean;

  constructor() {
    super();
    this.showDoctorMessage = true;
  }
}
