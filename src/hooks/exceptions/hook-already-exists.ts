import { BitError } from '@teambit/bit-error';

export default class HookAlreadyExists extends BitError {
  hookName: string;

  constructor(hookName: string) {
    super();
    this.hookName = hookName;
  }
}
