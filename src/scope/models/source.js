import { BitObject } from '../objects';

export default class Source extends BitObject {
  contents: Buffer;  

  constructor(contents: Buffer) {
    super();
    this.contents = contents;
  }

  id() {
    return this.toString();
  }

  toBuffer() {
    return this.contents;
  }

  static parse(contents: string): Source {
    return new Source(new Buffer(contents));
  }

  static from(str: string): Source {
    return new Source(str);
  }
}
