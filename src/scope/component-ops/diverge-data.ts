import { Ref } from '../../scope/objects';

export class DivergeData {
  snapsOnLocalOnly: Ref[];
  snapsOnRemoteOnly: Ref[];
  commonSnapBeforeDiverge: Ref | null;
  constructor(snapsOnLocalOnly?: Ref[], snapsOnRemoteOnly?: Ref[], commonSnapBeforeDiverge?: Ref | null) {
    this.snapsOnLocalOnly = snapsOnLocalOnly || [];
    this.snapsOnRemoteOnly = snapsOnRemoteOnly || [];
    this.commonSnapBeforeDiverge = commonSnapBeforeDiverge || null;
  }
  /**
   * when a local and remote history have diverged, a true merge is needed.
   */
  isDiverged(): boolean {
    return Boolean(this.snapsOnLocalOnly.length && this.snapsOnRemoteOnly.length);
  }

  /**
   * when a local is ahead of the remote, no merge is needed.
   */
  isLocalAhead(): boolean {
    return Boolean(this.snapsOnLocalOnly.length);
  }

  /**
   * when a remote is ahead of the local, but local has no new commits, a fast-forward merge is possible.
   */
  isRemoteAhead(): boolean {
    return Boolean(this.snapsOnRemoteOnly.length);
  }
}
