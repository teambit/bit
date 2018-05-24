/** @flow */
import AbstractError from '../../error/abstract-error';

export default class VersionAlreadyExists extends AbstractError {
  version: string;
  componentId: string;
  constructor(version: string, componentId: string) {
    super();
    this.version = version;
    this.componentId = componentId;
  }
}
