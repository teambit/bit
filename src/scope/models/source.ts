import BitObject from '../objects/object';

// TODO: fix .parse
// @ts-ignore
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
