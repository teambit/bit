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
    // zlib returns small results as a slice of a bigger (16KB) buffer. unlike other objects, which are parsed and dropped,
    // a Source keeps these bytes, often for long (e.g. as a component file), so it copies them instead of pinning 16KB.
    if (contents.byteLength < contents.buffer.byteLength / 2) contents = Buffer.from(contents);
    return new Source(contents);
  }

  static from(buffer: Buffer): Source {
    return new Source(buffer);
  }
}
