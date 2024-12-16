import { BitError } from '@teambit/bit-error';

export default class ProtocolNotSupported extends BitError {
  constructor() {
    super('error: remote scope protocol is not supported, please use: `file://`, `http://`, `https://`');
  }
}
