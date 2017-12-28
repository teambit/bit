/** @flow */

export default class HookAlreadyExists extends Error {
  hookName: string;

  constructor(hookName: string) {
    super();
    this.hookName = hookName;
  }
}
