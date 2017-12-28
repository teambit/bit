/** @flow */

export default class HookNotExists extends Error {
  hookName: string;

  constructor(hookName: string) {
    super();
    this.hookName = hookName;
  }
}
