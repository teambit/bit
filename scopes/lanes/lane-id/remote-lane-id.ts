import { BitError } from '@teambit/bit-error';
import { DEFAULT_LANE, LaneId, LANE_REMOTE_DELIMITER } from './lane-id';

export class RemoteLaneId {
  readonly name: string;
  readonly scope: string;
  constructor({ name, scope }: { name: string; scope: string }) {
    if (!scope) throw new TypeError('RemoteLaneId expects to get scope');
    this.name = name;
    this.scope = scope;
    Object.freeze(this);
  }
  static from(name: string, scope: string): RemoteLaneId {
    return new RemoteLaneId({ scope, name });
  }
  static parse(id: string): RemoteLaneId {
    if (!id.includes(LANE_REMOTE_DELIMITER)) {
      throw new BitError(`invalid remote lane-id, ${id} is missing a delimiter "(${LANE_REMOTE_DELIMITER})"`);
    }
    const split = id.split(LANE_REMOTE_DELIMITER);
    const [scope, ...tail] = split;
    return new RemoteLaneId({ scope, name: tail.join(LANE_REMOTE_DELIMITER) });
  }
  hasSameName(id: LaneId): boolean {
    return this.name === id.name;
  }
  hasSameScope(id: LaneId): boolean {
    if (!id.scope && !this.scope) return true;
    return this.scope === id.scope;
  }
  isEqual(laneId: LaneId) {
    return this.hasSameName(laneId) && this.hasSameScope(laneId);
  }
  isDefault() {
    return this.name === DEFAULT_LANE;
  }
  toString(): string {
    return this.scope + LANE_REMOTE_DELIMITER + this.name;
  }
}
