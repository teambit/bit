import { BitError } from '@teambit/bit-error';

export const DEFAULT_LANE = 'main';

export const LANE_REMOTE_DELIMITER = '/';

export class LaneId {
  readonly name: string;
  readonly scope: string;
  constructor({ name, scope }: { name: string; scope: string }) {
    this.name = name;
    this.scope = scope;
    Object.freeze(this);
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
    // @todo: remove this "if" ASAP, it's for backward compatibility
    if (!this.scope) return this.name;

    return this.scope + LANE_REMOTE_DELIMITER + this.name;
  }
  toObject() {
    return { scope: this.scope, name: this.name };
  }
  static from(name: string, scope: string): LaneId {
    return new LaneId({ scope, name });
  }
  static parse(id: string): LaneId {
    if (!id.includes(LANE_REMOTE_DELIMITER)) {
      throw new BitError(`invalid lane-id, "${id}" is missing a delimiter "(${LANE_REMOTE_DELIMITER})"`);
    }

    const split = id.split(LANE_REMOTE_DELIMITER);
    if (split.length > 2) {
      throw new BitError(`invalid lane-id "${id}". a lane id can have only one "${LANE_REMOTE_DELIMITER}"`);
    }
    return LaneId.from(split[1], split[0]);
  }
}
