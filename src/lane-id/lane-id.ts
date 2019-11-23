import { DEFAULT_LANE } from '../constants';

export default class LaneId {
  scope: string | null | undefined;
  name: string;
  constructor({ scope, name }: { scope?: string | null | undefined; name: string }) {
    this.scope = scope;
    this.name = name;
  }
  isDefault() {
    return this.name === DEFAULT_LANE;
  }
  hasSameName(id: LaneId): boolean {
    return this.name === id.name;
  }
  hasScope(): boolean {
    return Boolean(this.scope);
  }
  hasSameScope(id: LaneId): boolean {
    if (this.hasScope() && id.hasScope()) return this.scope === id.scope;
    if (!this.hasScope() && !id.hasScope()) return true;
    return false; // one has scope but not the other
  }
  isEqual(laneId: LaneId) {
    return this.hasSameName(laneId) && this.hasSameScope(laneId);
  }
  toString(ignoreScope = false): string {
    const { name, scope } = this;
    return ignoreScope || !scope ? name : [scope, name].join('/');
  }
}
