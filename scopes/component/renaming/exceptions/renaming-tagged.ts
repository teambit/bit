import { BitError } from '@teambit/bit-error';

export class RenamingTagged extends BitError {
  constructor(idsStr: string[]) {
    super(`the following components are tagged/snapped but not exported:\n${idsStr.join(', ')}
renaming them will result in deprecating/deleting the current ones and creating new components, which is unnecessary.
please reset the components first (using "bit reset") and then re-run the rename command`);
  }
}
