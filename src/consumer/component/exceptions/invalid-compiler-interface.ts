import AbstractError from '../../../error/abstract-error';

export default class InvalidCompilerInterface extends AbstractError {
  compilerName: string;
  constructor(compilerName: string) {
    super();
    this.compilerName = compilerName;
  }
}
