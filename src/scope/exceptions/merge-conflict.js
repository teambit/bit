// @flow
export default class MergeConflict extends Error {
  id: string;
  versions: string[];

  constructor(id: string, versions: string[]) {
    super();
    this.id = id;
    this.versions = versions;
  }
}
