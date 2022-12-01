import { Ref } from '../objects';

export class SnapsDistance {
  constructor(
    public snapsOnSourceOnly: Ref[] = [],
    public snapsOnTargetOnly: Ref[] = [],
    public commonSnapBeforeDiverge?: Ref | null,
    public err?: Error
  ) {}
  /**
   * when a local and remote history have diverged, a true merge is needed.
   */
  isDiverged(): boolean {
    return Boolean(this.snapsOnSourceOnly.length && this.snapsOnTargetOnly.length);
  }

  /**
   * when a local is ahead of the remote, no merge is needed.
   */
  isSourceAhead(): boolean {
    return Boolean(this.snapsOnSourceOnly.length);
  }

  /**
   * when a remote is ahead of the local, but local has no new commits, a fast-forward merge is possible.
   */
  isTargetAhead(): boolean {
    return Boolean(this.snapsOnTargetOnly.length);
  }
}
