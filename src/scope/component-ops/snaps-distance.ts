import { Ref } from '../objects';

export class SnapsDistance {
  constructor(
    public snapsOnSourceOnly: Ref[] = [],
    public snapsOnTargetOnly: Ref[] = [],
    public commonSnapBeforeDiverge?: Ref | null,
    public err?: Error
  ) {}
  /**
   * whether the source and the target history have diverged at some point. (in which case, a true merge is needed).
   */
  isDiverged(): boolean {
    return Boolean(this.snapsOnSourceOnly.length && this.snapsOnTargetOnly.length);
  }

  /**
   * whether the source is ahead of the target (in which case, no merge is needed).
   */
  isSourceAhead(): boolean {
    return Boolean(this.snapsOnSourceOnly.length);
  }

  /**
   * whether the target is ahead of the source. (in which case, a fast-forward merge is possible).
   */
  isTargetAhead(): boolean {
    return Boolean(this.snapsOnTargetOnly.length);
  }

  /**
   * whether the source is up to date. (it has all snaps from the target).
   */
  isUpToDate(): boolean {
    return !this.isTargetAhead();
  }
}
