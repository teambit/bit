import AbstractError from '../../error/abstract-error';

type IdAndVersions = { id: string; versions: string[] };
type IdAndLane = { id: string; lane?: string };

export default class MergeConflictOnRemote extends AbstractError {
  code: number;
  idsAndVersionsWithConflicts: IdAndVersions[];
  idsNeedUpdate: IdAndLane[];

  constructor(idsAndVersionsWithConflicts: IdAndVersions[], idsNeedUpdate: IdAndLane[]) {
    super();
    this.code = 131;
    this.idsAndVersionsWithConflicts = idsAndVersionsWithConflicts;
    this.idsNeedUpdate = idsNeedUpdate;
  }
}
