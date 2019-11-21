import AbstractError from '../../../../error/abstract-error';

export default class ObjectsWithoutConsumer extends AbstractError {
  scopePath: string;
  showDoctorMessage: boolean;

  constructor(scopePath: string) {
    super();
    this.scopePath = scopePath;
    this.showDoctorMessage = true;
  }
}
