/** @flow */

export default class CacheNotFound extends Error {
  constructor(bitId: string) {
    super();
    this.bitId = bitId;
  }
}
