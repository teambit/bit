/** @flow */

export default class GitHookAlreadyExists extends Error {
  hookName: string;

  constructor(hookName: string) {
    super();
    this.hookName = hookName;
  }
}
