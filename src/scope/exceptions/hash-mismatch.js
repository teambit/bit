/** @flow */

export default class HashMismatch {
  id: string;
  version: string;
  originalHash: string;
  currentHash: string;
  constructor(id: string, version: string, originalHash: string, currentHash: string) {
    this.id = id;
    this.version = version;
    this.originalHash = originalHash;
    this.currentHash = currentHash;
  }
}
