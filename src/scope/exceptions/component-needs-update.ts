import { BitError } from '@teambit/bit-error';

export default class ComponentNeedsUpdate extends BitError {
  id: string;
  hash: string;
  lane?: string;

  constructor(id: string, hash: string, lane?: string) {
    super();
    this.id = id;
    this.hash = hash;
    this.lane = lane;
  }
}
