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
  /** `null` = the server couldn't classify (transient version-load failure) — NOT "no changes". */
  changes: ChangeType[] | null;
  upToDate: boolean;
};

export class LaneComponentDiff {
  constructor(
    readonly componentId: ComponentID,
    /** `null` = unclassified (see {@link classified}) — distinct from `[ChangeType.NONE]`. */
    readonly changes: ChangeType[] | null,
    readonly upToDate: boolean,
    readonly sourceHead: string,
    readonly targetHead?: string,
    readonly baseSource?: DiffBaseSource
  ) {}

  /**
   * whether the server managed to classify this component's changes. `false` (changes = null) means
   * a transient derivation failure — an UNKNOWN state that consumers must not render as "no changes"
   * (hiding a possibly-changed component, or triggering an all-clear blank state).
   */
  get classified() {
    return this.changes !== null;
  }

  get new() {
    return Boolean(this.changes?.includes(ChangeType.NEW));
  }

  get changed() {
    if (!this.changes) return false;
    return this.changes.length > 0 && !this.changes.includes(ChangeType.NEW) && !this.changes.includes(ChangeType.NONE);
  }

  get dependencyChanged() {
    return Boolean(this.changes?.includes(ChangeType.DEPENDENCY));
  }

  get sourceCodeChanged() {
    return Boolean(this.changes?.includes(ChangeType.SOURCE_CODE));
  }

  get changeType(): ChangeType | undefined {
    // unclassified (see `classified`): the server couldn't derive change types. surface `undefined`
    // rather than NONE so consumers can tell "unknown" apart from a verified no-op — the previous
    // NONE mapping made a transient derivation failure read as "no changes" (and hid the component).
    if (!this.changes) return undefined;
    // an empty list shouldn't occur (`deriveChangeTypes` always emits at least [NONE]) — map it to
    // NONE rather than falling through to the ASPECTS fallback, which would fabricate a change.
    if (this.changes.length === 0) return ChangeType.NONE;
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
