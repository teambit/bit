import AbstractError from '../../../error/abstract-error';

export default class InvalidConfigPropPath extends AbstractError {
  fieldName: string;
  fieldValue: string;
  showDoctorMessage: boolean;

  constructor(fieldName: string, fieldValue: string) {
    super();
    this.fieldName = fieldName;
    this.fieldValue = fieldValue;
    this.showDoctorMessage = true;
  }
}
