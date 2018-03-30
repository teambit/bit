// @flow
export default class MergeConflictOnRemote extends Error {
  id: string;
  code: number;
  versions: string[];

  constructor(id: string, versions: string[]) {
    super();
    this.code = 131;
    this.id = id;
    this.versions = versions;
  }
}
