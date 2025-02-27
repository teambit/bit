import { BitError } from '@teambit/bit-error';

export default class ComponentNeedsUpdate extends BitError {
  constructor(readonly id: string, readonly hash: string, readonly lane?: string, readonly isDeleted = false) {
    super();
  }
}
