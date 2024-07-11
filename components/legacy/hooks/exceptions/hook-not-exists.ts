import { BitError } from '@teambit/bit-error';

export default class HookNotExists extends BitError {
  hookName: string;

  constructor(hookName: string) {
    super();
    this.hookName = hookName;
  }
}
