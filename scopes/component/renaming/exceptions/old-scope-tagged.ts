import { BitError } from '@teambit/bit-error';

export class OldScopeTagged extends BitError {
  constructor(idsStr: string[]) {
    super(`unable to rename the scope for the following tagged components:\n${idsStr.join(', ')}
because these components were tagged, the objects have the dependencies data of the old-scope.
to be able to rename the scope, please untag the components first (using "bit reset" command)`);
  }
}
