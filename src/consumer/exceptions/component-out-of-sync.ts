import AbstractError from '../../error/abstract-error';

export default class ComponentOutOfSync extends AbstractError {
  id: string;
  showDoctorMessage: boolean;

  constructor(id: string) {
    super();
    this.id = id;
    this.showDoctorMessage = true;
  }
}
