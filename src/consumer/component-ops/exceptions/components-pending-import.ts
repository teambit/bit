import { BitError } from '@teambit/bit-error';
import { IMPORT_PENDING_MSG } from '../../../constants';

export default class ComponentsPendingImport extends BitError {
  constructor() {
    super(IMPORT_PENDING_MSG);
  }
}
