import { ComponentID } from '@teambit/component-id';
import { ChangeType } from './change-type';

/**
 * where the compared base was resolved from:
 * - `workspace`: the base was already present in the local scope.
 * - `scope`: the base only existed on the remote scope and was fetched on demand for this diff.
 */
export type DiffBaseSource = 'workspace' | 'scope';

export type PlainLaneComponentDiff = {
  componentId: string;
  sourceHead: string;
  targetHead?: string;
  baseSource?: DiffBaseSource;
  changes: ChangeType[];
  upToDate: boolean;
};

export class LaneComponentDiff {
  constructor(
    readonly componentId: ComponentID,
    readonly changes: ChangeType[],
    readonly upToDate: boolean,
    readonly sourceHead: string,
    readonly targetHead?: string,
    readonly baseSource?: DiffBaseSource
  ) {}

  get new() {
    return this.changes.includes(ChangeType.NEW);
  }

  get changed() {
    return this.changes.length > 0 && !this.changes.includes(ChangeType.NEW) && !this.changes.includes(ChangeType.NONE);
  }

  get dependencyChanged() {
    return this.changes.includes(ChangeType.DEPENDENCY);
  }

  get sourceCodeChanged() {
    return this.changes.includes(ChangeType.SOURCE_CODE);
  }

  get changeType() {
    if (this.changes.length === 1) return this.changes[0];
    if (this.sourceCodeChanged) return ChangeType.SOURCE_CODE;
    if (this.dependencyChanged) return ChangeType.DEPENDENCY;
    if (this.new) return ChangeType.NEW;
    if (this.changes.includes(ChangeType.NONE)) return ChangeType.NONE;
    return ChangeType.ASPECTS;
  }

  toObject() {
    return {
      componentId: this.componentId.toString(),
      changes: this.changes,
      upToDate: this.upToDate,
      sourceHead: this.sourceHead,
      targetHead: this.targetHead,
      baseSource: this.baseSource,
    };
  }

  static from(plainComponentDiff: PlainLaneComponentDiff) {
    const id = ComponentID.fromString(plainComponentDiff.componentId);
    return new LaneComponentDiff(
      id,
      plainComponentDiff.changes,
      plainComponentDiff.upToDate,
      plainComponentDiff.sourceHead,
      plainComponentDiff.targetHead,
      plainComponentDiff.baseSource
    );
  }
}
