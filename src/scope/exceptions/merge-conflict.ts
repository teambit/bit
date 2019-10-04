import AbstractError from '../../error/abstract-error';

export default class MergeConflict extends AbstractError {
  id: string;
  versions: string[];

  constructor(id: string, versions: string[]) {
    super();
    this.id = id;
    this.versions = versions;
  }
}
