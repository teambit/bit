/** @flow */
export default class CorruptedComponent extends Error {
  id: string;
  version: number;

  constructor(id: string, version: number) {
    super();
    this.id = id;
    this.version = version;
  }
}
