/** @flow */
import { BitId } from '../../bit-id';

export default class CacheNotFound extends Error {
  bitId: BitId;
  constructor(bitId: string) {
    super();
    this.bitId = bitId;
  }
}
