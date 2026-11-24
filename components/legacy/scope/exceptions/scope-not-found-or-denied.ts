import { BitError } from '@teambit/bit-error';

export class ScopeNotFoundOrDenied extends BitError {
  constructor(readonly scopeName: string) {
    super(
      `unable to find the remote scope "${scopeName}" or you don't have access to this scope, please make sure you are logged in`
    );
  }
}
