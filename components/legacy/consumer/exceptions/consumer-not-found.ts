import { BitError } from '@teambit/bit-error';

export default class ConsumerNotFound extends BitError {
  constructor() {
    super('workspace not found. to initiate a new workspace, please use `bit init`');
  }
}
