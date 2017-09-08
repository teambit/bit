/** @flow */
export default class IdExportedAlready extends Error {
  id: string;
  remote: string;

  constructor(id: string, remote: string) {
    super();
    this.id = id;
    this.remote = remote;
  }
}
