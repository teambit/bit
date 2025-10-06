import { BitError } from '@teambit/bit-error';

export class NoScriptsDefined extends BitError {
  constructor(readonly envId: string) {
    super(`no scripts are defined in environment "${envId}"`);
  }
}
