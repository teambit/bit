import { DEFAULT_LANE } from '../constants';

export default class LaneId {
  name: string;
  constructor({ name }: { name: string }) {
    this.name = name;
  }
  isDefault() {
    return this.name === DEFAULT_LANE;
  }
  hasSameName(id: LaneId): boolean {
    return this.name === id.name;
  }
  isEqual(laneId: LaneId) {
    return this.hasSameName(laneId);
  }
  toString(): string {
    return this.name;
  }
  static from(name: string): LaneId {
    return new LaneId({ name });
  }
}
