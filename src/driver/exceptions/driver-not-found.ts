import AbstractError from '../../error/abstract-error';

export default class DriverNotFoundError extends AbstractError {
  driver: string;
  lang: string;
  name: string;
  showDoctorMessage: boolean;

  constructor(driver: string, lang: string) {
    super();
    this.name = 'DriverNotFound';
    this.driver = driver;
    this.lang = lang;
    this.showDoctorMessage = true;
  }
}
