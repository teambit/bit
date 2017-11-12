/** @flow */
export default class CorruptedComponent extends Error {
  id: string;
  version: string;

  constructor(id: string, version: string) {
    super();
    this.id = id;
    this.version = version;
  }
}
