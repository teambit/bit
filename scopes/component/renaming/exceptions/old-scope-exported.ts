import { BitError } from '@teambit/bit-error';

export class OldScopeExported extends BitError {
  constructor(idsStr: string[]) {
    super(`unable to rename the scope for the following exported components:\n${idsStr.join(', ')}
because these components were exported already, other components may use them and they'll break upon rename.
instead, deprecate the above components (using "bit deprecate"), tag, export and then eject them.
once they are not in the workspace, you can fork them ("bit fork") with the new scope-name`);
  }
}
