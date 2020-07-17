import AbstractError from '../../error/abstract-error';

export default class ParentNotFound extends AbstractError {
  id: string;
  versionHash: string;
  parentHash: string;
  constructor(id: string, versionHash: string, parentHash: string) {
    super();
    this.id = id;
    this.versionHash = versionHash;
    this.parentHash = parentHash;
  }
}
