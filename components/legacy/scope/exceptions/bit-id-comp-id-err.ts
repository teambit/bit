import { BitError } from '@teambit/bit-error';
import { VERSION_CHANGED_BIT_ID_TO_COMP_ID } from '@teambit/legacy.constants';

export class BitIdCompIdError extends BitError {
  constructor(readonly id: string) {
    super(`components in your workspace (e.g. "${id}") were tagged/snapped with older bit version (before v${VERSION_CHANGED_BIT_ID_TO_COMP_ID}), please bit-export with the same bit version.
alternatively, if local (unexported) tags/snaps/lanes are not relevant for you anymore, reset them by running "bit reset --never-exported".
in case "bit reset" fails with this error, clear your local scope by running "bit init --reset-scope", and then run "bit status"`);
  }
}
