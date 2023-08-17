import { BitError } from '@teambit/bit-error';

export class OldScopeExported extends BitError {
  constructor(idsStr: string[]) {
    super(`unable to rename the scope for the following exported components:\n${idsStr.join(', ')}
because these components were exported already, other components may use them and they'll break upon rename.
instead, run "bit rename" to deprecate the current component and create a new component as a fork of it,
specifying the new scope with the --scope flag`);
  }
}
