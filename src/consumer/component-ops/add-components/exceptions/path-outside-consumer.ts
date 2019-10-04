import AbstractError from '../../../../error/abstract-error';

export default class PathOutsideConsumer extends AbstractError {
  path: string;
  constructor(path: string) {
    super();
    this.path = path;
  }
}
