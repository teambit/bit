import chalk from 'chalk';
import { BitError } from '@teambit/bit-error';

type IdAndVersions = { id: string; versions: string[]; isDeleted?: boolean };
type IdAndLane = { id: string; lane?: string; isDeleted?: boolean };

export default class MergeConflictOnRemote extends BitError {
  code: number;

  constructor(
    readonly idsAndVersionsWithConflicts: IdAndVersions[],
    readonly idsNeedUpdate: IdAndLane[]
  ) {
    const deletedIds = [...idsAndVersionsWithConflicts, ...idsNeedUpdate].filter((i) => i.isDeleted).map((i) => i.id);
    let output = '';
    if (deletedIds.length) {
      output += `error: the following component(s) were marked as deleted on the remote scope: ${deletedIds
        .map((i) => chalk.bold(i))
        .join(', ')}.
the current components seem to be re-created and have a different history.
to resolve this error, you'll need to recover the deleted components, re-do your changes, then tag/snap and export.
here is a step-by-step guide:
1) backup your current component to another directory.
2) run "bit recover <component-id>". it'll restore the deleted component.
3) re-do your changes on the restored component.
4) run "bit tag" or "bit snap" to create a new version of the component.
5) run "bit export" to export the new version to the remote scope.
`;
    }
    const idsAndVersionsWithConflictsWithoutDeleted = idsAndVersionsWithConflicts.filter((i) => !i.isDeleted);
    if (idsAndVersionsWithConflictsWithoutDeleted.length) {
      output += `error: versions conflict occurred when exporting the component(s) ${idsAndVersionsWithConflictsWithoutDeleted
        .map((i) => `${chalk.bold(i.id)} (version(s): ${i.versions.join(', ')})`)
        .join(', ')} to the remote scope.
to resolve this conflict and merge your remote and local changes, please do the following:
1) bit reset [component-pattern] [--all]
2) bit checkout head [component-pattern]
once your changes are merged with the new remote version, please tag and export a new version of the component to the remote scope.`;
    }
    const idsNeedUpdateWithoutDeleted = idsNeedUpdate.filter((i) => !i.isDeleted);
    if (idsNeedUpdateWithoutDeleted.length) {
      output += `merge error occurred when exporting the component(s) ${idsNeedUpdateWithoutDeleted
        .map((i) => `${chalk.bold(i.id)}${i.lane ? ` (lane: ${i.lane})` : ''}`)
        .join(', ')} to the remote scope.
to resolve this error, please re-import the above components.
if the component is up to date, run "bit status" to make sure it's not merge-pending`;
    }
    super(output);
    this.code = 131;
  }
}
