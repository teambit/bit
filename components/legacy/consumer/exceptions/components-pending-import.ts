import { BitError } from '@teambit/bit-error';
import { IMPORT_PENDING_MSG } from '@teambit/legacy.constants';

export class ComponentsPendingImport extends BitError {
  constructor(ids: string[]) {
    super(`${IMPORT_PENDING_MSG}
(specifically: ${ids.join(' ')})`);
  }
}
