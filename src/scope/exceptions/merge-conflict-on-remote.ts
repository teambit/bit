import AbstractError from '../../error/abstract-error';

type IdAndVersions = { id: string; versions: string[] };
type IdAndLane = { id: string; lane?: string };

export default class MergeConflictOnRemote extends AbstractError {
  code: number;
  // @todo: once v15 is about to be released, rename it to `idsAndVersionsWithConflicts`
  idsAndVersions: IdAndVersions[]; // a better name is `idsAndVersionsWithConflicts`, however, to keep backward compatibility, we have to stick with this name
  idsNeedUpdate: IdAndLane[];

  constructor(idsAndVersionsWithConflicts: IdAndVersions[], idsNeedUpdate: IdAndLane[]) {
    super();
    this.code = 131;
    this.idsAndVersions = idsAndVersionsWithConflicts;
    this.idsNeedUpdate = idsNeedUpdate;
  }
}
