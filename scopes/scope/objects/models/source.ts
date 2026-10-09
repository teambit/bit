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
    // zlib returns an inflated object smaller than 16KB as a slice of a 16KB buffer. a Source is often kept for long
    // (e.g. as a component file), so it gets its own copy. otherwise, every small file holds 16KB.
    if (contents.byteLength < contents.buffer.byteLength / 2) contents = Buffer.from(contents);
    return new Source(contents);
  }

  static from(buffer: Buffer): Source {
    return new Source(buffer);
  }
}
