import { BitError } from '@teambit/bit-error';

export class OldScopeTagged extends BitError {
  constructor(idsStr: string[]) {
    super(`unable to rename the scope for the following tagged components:\n${idsStr.join(', ')}
because these components have been locally tagged, the component's objects have the dependencies data of the old-scope.
to be able to rename the scope, please untag these components (using "bit reset") and then re-run the scope-rename command`);
  }
}
