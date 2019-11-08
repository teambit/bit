import AbstractError from '../../error/abstract-error';

type IdAndVersions = { id: string; versions: string[] };

export default class MergeConflictOnRemote extends AbstractError {
  code: number;
  idsAndVersionsWithConflicts: IdAndVersions[];
  idsNeedUpdate: Array<{ id: string }>;

  constructor(idsAndVersionsWithConflicts: IdAndVersions[], idsNeedUpdate: Array<{ id: string }>) {
    super();
    this.code = 131;
    this.idsAndVersionsWithConflicts = idsAndVersionsWithConflicts;
    this.idsNeedUpdate = idsNeedUpdate;
  }
}
