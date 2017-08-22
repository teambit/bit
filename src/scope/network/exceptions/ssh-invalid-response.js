/** @flow */

export default class SSHInvalidResponse extends Error {
  response: string;

  constructor(response: string) {
    super();
    this.response = response;
  }
}
