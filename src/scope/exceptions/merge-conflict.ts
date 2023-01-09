import { BitError } from '@teambit/bit-error';

export default class MergeConflict extends BitError {
  id: string;
  versions: string[];

  constructor(id: string, versions: string[]) {
    super(`error: merge conflict occurred while importing the component ${id}. conflict version(s): ${versions.join(
      ', '
    )}
to resolve it and merge your local and remote changes, please do the following:
1) bit reset ${id}
2) bit import
3) bit checkout head ${id}
once your changes are merged with the new remote version, you can tag and export a new version of the component to the remote scope.`);
    this.id = id;
    this.versions = versions;
  }
}
