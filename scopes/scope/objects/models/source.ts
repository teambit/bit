import { BitObject } from '../objects';

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
    Source.from === defaultFrom &&
    Source.prototype.hash === defaultHash &&
    Source.prototype.id === defaultId &&
    BitObject.makeHash === defaultMakeHash
  );
}
