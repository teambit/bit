import { BitError } from '@teambit/bit-error';

export class OldScopeNotFound extends BitError {
  constructor(oldScope: string) {
    super(`none of the components is using "${oldScope}". also, the workspace is not configured with "${oldScope}"`);
  }
}
