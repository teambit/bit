import AbstractError from '../../../error/abstract-error';

export default class ComponentNotFoundInPath extends AbstractError {
  path: string;
  code: number;

  constructor(path: string) {
    super();
    this.code = 127;
    this.path = path;
  }
}
