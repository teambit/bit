import { v4 } from 'uuid';
import { getStringifyArgs } from '@teambit/legacy.utils';
import { getBasicLog } from '@teambit/harmony.modules.get-basic-log';
import { BitObject } from '../objects';
import type Lane from './lane';

type Log = { date: string; username?: string; email?: string; message?: string };

export type HistoryItem = {
  log: Log;
  components: string[];
  deleted?: string[];
  /**
   * Snapshot of `lane.updateDependents` at the time this history entry was recorded. Used by
   * `bit reset` to restore the prior `updateDependents` state when a cascaded snap is rolled
   * back, and by audit flows that want to see how updateDependents evolved over the lane's life.
   * Optional for backward compatibility with entries written before this field existed.
   */
  updateDependents?: string[];
  /**
   * The value of `lane.overrideUpdateDependents` at the time this history entry was recorded.
   * Needed alongside `updateDependents` so that `bit reset` can restore not just the list but
   * whether the lane was in the "needs to push updateDependents" state at that point.
   */
  overrideUpdateDependents?: boolean;
};

type History = { [uuid: string]: HistoryItem };

type LaneHistoryProps = {
  name: string;
  scope: string;
  laneHash: string;
  history: History;
};

export class LaneHistory extends BitObject {
  private name: string;
  private scope: string;
  private laneHash: string;
  private history: History;

  constructor(props: LaneHistoryProps) {
    super();
    this.name = props.name;
    this.scope = props.scope;
    this.laneHash = props.laneHash;
    this.history = props.history;
  }

  id() {
    return `${this.laneHash}:${LaneHistory.name}`;
  }

  static fromLaneObject(laneObject: Lane): LaneHistory {
    return new LaneHistory({
      scope: laneObject.scope,
      name: laneObject.name,
      laneHash: laneObject.hash().toString(),
      history: {},
    });
  }

  toObject(): Record<string, any> {
    return {
      name: this.name,
      scope: this.scope,
      laneHash: this.laneHash,
      history: this.history,
    };
  }

  toString(pretty: boolean): string {
    const args = getStringifyArgs(pretty);
    return JSON.stringify(this.toObject(), ...args);
  }

  toBuffer(pretty): Buffer {
    return Buffer.from(this.toString(pretty));
  }

  getHistory(): History {
    return this.history;
  }

  getHistoryIds(): string[] {
    return Object.entries(this.history)
      .sort(([, a], [, b]) => Number(a.log.date) - Number(b.log.date))
      .map(([id]) => id);
  }

  async addHistory(laneObj: Lane, msg?: string, historyKey?: string) {
    const log: Log = await getBasicLog();
    if (msg) log.message = msg;
    const components = laneObj.toComponentIds().toStringArray();
    const deleted = laneObj.components
      .filter((c) => c.isDeleted)
      .map((c) => c.id.changeVersion(c.head.toString()).toString());
    const updateDependents = laneObj.updateDependents?.map((id) => id.toString());
    const overrideUpdateDependents = laneObj.shouldOverrideUpdateDependents() || undefined;
    this.history[historyKey || v4()] = {
      log,
      components,
      ...(deleted.length && { deleted }),
      ...(updateDependents?.length && { updateDependents }),
      ...(overrideUpdateDependents && { overrideUpdateDependents }),
    };
  }

  /**
   * Return the most recent history entry (by log.date) excluding the given keys. Used by
   * `bit reset` to find the "post-revert" target state after removing the batches being reset.
   */
  getLatestEntryExcluding(excludeKeys: string[]): HistoryItem | undefined {
    const entries = Object.entries(this.history)
      .filter(([key]) => !excludeKeys.includes(key))
      .sort(([, a], [, b]) => Number(b.log.date) - Number(a.log.date));
    return entries[0]?.[1];
  }

  removeHistoryEntries(keys: string[]) {
    for (const key of keys) {
      delete this.history[key];
    }
  }

  merge(laneHistory: LaneHistory) {
    this.history = { ...this.history, ...laneHistory.history };
  }

  static create(name: string, scope: string, laneHash: string) {
    return new LaneHistory({
      name,
      scope,
      laneHash,
      history: {},
    });
  }

  static parse(contents: string): LaneHistory {
    const parsed = JSON.parse(contents);
    const props: LaneHistoryProps = {
      name: parsed.name,
      scope: parsed.scope,
      laneHash: parsed.laneHash,
      history: parsed.history,
    };
    return new LaneHistory(props);
  }
}
