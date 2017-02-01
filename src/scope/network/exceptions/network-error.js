/** @flow */

export default class NetworkError extends Error {
  remoteErr: string;

  constructor(remoteErr: string) {
    super();
    this.remoteErr = remoteErr;
  }
}
