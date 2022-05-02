import { LaneId } from './lane-id';

export class LocalLaneId extends LaneId {
  constructor({ name }: { name: string }) {
    super({ name });
  }
  static from(name: string): LocalLaneId {
    return new LocalLaneId({ name });
  }
}
