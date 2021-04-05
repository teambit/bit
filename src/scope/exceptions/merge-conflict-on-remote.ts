import chalk from 'chalk';
import { BitError } from '@teambit/bit-error';

type IdAndVersions = { id: string; versions: string[] };
type IdAndLane = { id: string; lane?: string };

export default class MergeConflictOnRemote extends BitError {
  code: number;

  constructor(idsAndVersionsWithConflicts: IdAndVersions[], idsNeedUpdate: IdAndLane[]) {
    let output = '';
    if (idsAndVersionsWithConflicts.length) {
      output += `error: merge conflict occurred when exporting the component(s) ${idsAndVersionsWithConflicts
        .map((i) => `${chalk.bold(i.id)} (version(s): ${i.versions.join(', ')})`)
        .join(', ')} to the remote scope.
to resolve this conflict and merge your remote and local changes, please do the following:
1) bit untag [id] [version]
2) bit import
3) bit checkout [version] [id]
once your changes are merged with the new remote version, please tag and export a new version of the component to the remote scope.`;
    }
    if (idsNeedUpdate.length) {
      output += `error: merge error occurred when exporting the component(s) ${idsNeedUpdate
        .map((i) => `${chalk.bold(i.id)}${i.lane ? ` (lane: ${i.lane})` : ''}`)
        .join(', ')} to the remote scope.
to resolve this error, please re-import the above components.
if the component is up to date, run "bit status" to make sure it's not merge-pending`;
    }
    super(output);
    this.code = 131;
  }
}
