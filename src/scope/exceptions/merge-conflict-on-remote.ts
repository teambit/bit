import AbstractError from '../../error/abstract-error';

export default class MergeConflictOnRemote extends AbstractError {
  code: number;
  idsAndVersions: Array<{ id: string; versions: string[] }>;

  constructor(idsAndVersions: Array<{ id: string; versions: string[] }>) {
    super();
    this.code = 131;
    this.idsAndVersions = idsAndVersions;
  }
}
