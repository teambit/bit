import { BitObject } from '../objects';

export default class Source extends BitObject {
  contents: Buffer;

  constructor(contents: Buffer) {
    super();
    this.contents = contents;
  }

  id() {
    return this.contents.toString();
  }

  toBuffer() {
    return this.contents;
  }

  toString() {
    return this.contents.toString();
  }

  static parse(contents: string): Source {
    return new Source(new Buffer(contents));
  }

  static from(str: string): Source {
    return new Source(str);
  }
}
