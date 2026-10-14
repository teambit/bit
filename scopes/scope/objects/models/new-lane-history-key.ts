import { v4 } from 'uuid';

/** Allocate the durable history key without constructing a Lane or LaneHistory model. */
export function newLaneHistoryKey(): string {
  return v4();
}
