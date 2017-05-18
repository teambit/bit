/** @flow */
export default class RemoteScopeNotFound extends Error {
  name: string;
  code: number;

  constructor(name: string) {
    super();
    this.code = 129;
    this.name = name;
  }
}
