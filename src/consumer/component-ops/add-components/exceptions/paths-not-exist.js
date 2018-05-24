/** @flow */
import AbstractError from '../../../../error/abstract-error';

export default class PathsNotExist extends AbstractError {
  paths: string[];
  constructor(paths: string[]) {
    super();
    this.paths = paths;
  }
}
