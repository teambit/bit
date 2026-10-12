import { BitObject } from '../objects';
import { registerRustSnapshotFunctionReference } from '../objects/rust-snapshot-guards';

// TODO: fix .parse
export default class Source extends BitObject {
  contents: Buffer;

  constructor(contents: Buffer) {
    super();
    this.contents = contents;
  }

  id() {
    return this.contents;
  }

  toBuffer() {
    return this.contents;
  }

  toString() {
    return this.contents.toString();
  }

  static parse(contents: Buffer): Source {
    return new Source(contents);
  }

  static from(buffer: Buffer): Source {
    return new Source(buffer);
  }
}

const defaultFrom = Source.from;
const defaultHash = Source.prototype.hash;
const defaultId = Source.prototype.id;
const defaultMakeHash = BitObject.makeHash;
export function canHashSourceNatively(): boolean {
  return (
    Object.getOwnPropertyDescriptor(Source, 'from')?.value === defaultFrom &&
    (Object.getOwnPropertyDescriptor(Source.prototype, 'hash') || Object.getOwnPropertyDescriptor(BitObject.prototype, 'hash'))?.value === defaultHash &&
    Object.getOwnPropertyDescriptor(Source.prototype, 'id')?.value === defaultId &&
    Object.getOwnPropertyDescriptor(BitObject, 'makeHash')?.value === defaultMakeHash
  );
}

registerRustSnapshotFunctionReference('HistoryQuerySourceClass', Source);
registerRustSnapshotFunctionReference('HistoryQuerySourceIdentity', canHashSourceNatively);
