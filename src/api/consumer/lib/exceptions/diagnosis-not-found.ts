import AbstractError from '../../../../error/abstract-error';

export default class DiagnosisNotFound extends AbstractError {
  diagnosisName: string;

  constructor(diagnosisName: string) {
    super();
    this.diagnosisName = diagnosisName;
  }
}
