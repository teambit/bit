import Ref from '../objects/ref';
import { uniqBy } from 'lodash';

type DetachedHeadsObject = {
  heads?: string[];
  deleted?: string[];
  current?: string;
};

export class DetachedHeads {
  constructor(
    protected heads: Ref[] = [],
    protected current?: Ref,
    protected deleted: Ref[] = []
  ) {}

  setHead(head: Ref) {
    this.current = head;
    this.heads.push(head);
  }

  getCurrent(): Ref | undefined {
    return this.current;
  }

  getAllHeads(): Ref[] {
    return this.heads;
  }

  /**
   * happens during reset. these heads are local, so no need to enter them into "deleted" array.
   */
  removeLocalHeads(refs: Ref[]) {
    this.heads = this.heads.filter((head) => !refs.find((ref) => ref.isEqual(head)));
    if (this.current && refs.find((ref) => ref.isEqual(this.current!))) {
      this.current = undefined;
    }
  }

  clearCurrent() {
    this.current = undefined;
  }

  merge(incoming: DetachedHeads, isImport: boolean) {
    if (!isImport) {
      this.current = undefined;
    }
    this.heads = uniqBy([...this.heads, ...incoming.heads], 'hash');
    this.deleted = uniqBy([...this.deleted, ...incoming.deleted], 'hash');
  }

  deleteFromHeadsIfNeeded() {
    this.heads = this.heads.filter((head) => !this.deleted.find((deleted) => deleted.isEqual(head)));
  }

  toObject(): DetachedHeadsObject | undefined {
    const heads = this.heads.length ? this.heads.map((head) => head.toString()) : undefined;
    const deleted = this.deleted.length ? this.deleted.map((head) => head.toString()) : undefined;
    const current = this.current?.toString();

    if (!heads && !deleted && !current) return undefined;

    return {
      heads,
      deleted,
      current,
    };
  }

  static fromObject(object?: DetachedHeadsObject): DetachedHeads {
    if (!object) {
      return new DetachedHeads();
    }
    const heads = object.heads ? object.heads.map((head) => new Ref(head)) : [];
    const deleted = object.deleted ? object.deleted.map((head) => new Ref(head)) : [];
    const current = object.current ? new Ref(object.current) : undefined;
    return new DetachedHeads(heads, current, deleted);
  }
}
