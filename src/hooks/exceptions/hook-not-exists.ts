import AbstractError from '../../error/abstract-error';

export default class HookNotExists extends AbstractError {
  hookName: string;

  constructor(hookName: string) {
    super();
    this.hookName = hookName;
  }
}
