export default class ValidationError extends Error {
  showDoctorMessage: boolean;

  constructor(msg: string) {
    super(msg);
    this.showDoctorMessage = true;
  }
}
