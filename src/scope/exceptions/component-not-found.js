/** @flow */
import AbstractError from '../../error/abstract-error';

export default class ComponentNotFound extends AbstractError {
  id: string;
  dependentId: ?string;
  code: number;
  showDoctorMessage: boolean;

  constructor(id: string, dependentId?: string) {
    super();
    this.code = 127;
    this.id = id;
    this.dependentId = dependentId;
    this.showDoctorMessage = true;
  }
}
