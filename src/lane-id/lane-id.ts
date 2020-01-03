/* eslint max-classes-per-file: 0 */
import { DEFAULT_LANE } from '../constants';

export default class LaneId {
  readonly name: string;
  readonly scope?: string | null;
  constructor({ name, scope }: { name: string; scope?: string | null }) {
    this.name = name;
    this.scope = scope;
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
    // @todo: decide how the delimiter should look like
    const delimiter = '//';
    return this.scope + delimiter + this.name;
  }
  static from(name: string, scope?: string | null): LaneId {
    return new LaneId({ scope, name });
  }
}

export class RemoteLaneId extends LaneId {
  readonly name!: string;
  readonly scope!: string;
  constructor({ name, scope }: { name: string; scope: string }) {
    super({ name, scope });
  }
  static from(name: string, scope: string): RemoteLaneId {
    return new RemoteLaneId({ scope, name });
  }
}

export class LocalLaneId extends LaneId {
  readonly name!: string;
  constructor({ name }: { name: string }) {
    super({ name });
  }
  static from(name: string): LocalLaneId {
    return new LocalLaneId({ name });
  }
}
