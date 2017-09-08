// @flow
export default class MergeConflict extends Error {
  id: string;
  code: number;

  constructor(id: string) {
    super();
    this.code = 131;
    this.id = id;
  }
}
