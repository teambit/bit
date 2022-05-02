export const DEFAULT_LANE = 'main';

// @todo: decide how the delimiter should look like
export const LANE_REMOTE_DELIMITER = '/';

export class LaneId {
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
