/** @flow */
export default class CyclicDependencies extends Error {
  msg: string;
  constructor(msg: string) {
    super();
    this.msg = msg;
  }
}
