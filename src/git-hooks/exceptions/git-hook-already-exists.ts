import AbstractError from '../../error/abstract-error';

export default class GitHookAlreadyExists extends AbstractError {
  hookName: string;

  constructor(hookName: string) {
    super();
    this.hookName = hookName;
  }
}
