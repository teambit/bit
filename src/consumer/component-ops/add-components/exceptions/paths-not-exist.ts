import AbstractError from '../../../../error/abstract-error';

export default class PathsNotExist extends AbstractError {
  paths: string[];
  showDoctorMessage: boolean;

  constructor(paths: string[]) {
    super();
    this.paths = paths;
    this.showDoctorMessage = true;
  }
}
