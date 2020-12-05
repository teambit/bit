/* eslint max-classes-per-file: 0 */
import R from 'ramda';

import { DEFAULT_LANE, LANE_REMOTE_DELIMITER } from '../constants';
import GeneralError from '../error/general-error';

export default class LaneId {
  readonly name: string;
  readonly scope?: string | null;
  constructor({ name, scope }: { name: string; scope?: string | null }) {
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
    if (!this.scope) return this.name;

    return this.scope + LANE_REMOTE_DELIMITER + this.name;
  }
  static from(name: string, scope?: string | null): LaneId {
    return new LaneId({ scope, name });
  }
}

export class RemoteLaneId extends LaneId {
  constructor({ name, scope }: { name: string; scope: string }) {
    if (!scope) throw new TypeError('RemoteLaneId expects to get scope');
    super({ name, scope });
  }
  // @ts-ignore
  set scope(scope: string) {
    this.scope = scope;
  }
  static from(name: string, scope: string): RemoteLaneId {
    return new RemoteLaneId({ scope, name });
  }
  static parse(id: string): RemoteLaneId {
    if (!id.includes(LANE_REMOTE_DELIMITER)) {
      throw new GeneralError(`invalid remote lane-id, ${id} is missing a delimiter "(${LANE_REMOTE_DELIMITER})"`);
    }
    const split = id.split(LANE_REMOTE_DELIMITER);
    return new RemoteLaneId({ scope: R.head(split), name: R.tail(split).join(LANE_REMOTE_DELIMITER) });
  }
}

export class LocalLaneId extends LaneId {
  constructor({ name }: { name: string }) {
    super({ name });
  }
  static from(name: string): LocalLaneId {
    return new LocalLaneId({ name });
  }
}
