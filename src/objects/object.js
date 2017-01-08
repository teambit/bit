/** @flow */
import { deflate, inflate, sha1 } from '../utils';
import { NULL_BYTE, SPACE_DELIMITER } from '../constants';

export default class BitObject {
  /**
   * indexing method
   */
  hash(): string {
    return sha1(this.id());
  }

  compress(): Promise<Buffer> {
    return deflate(this.serialize());
  }

  serialize(): Buffer {
    const contents = this.toBuffer();
    const header = `${this.constructor.name} ${contents.toString().length}${NULL_BYTE}$`;
    return Buffer.concat([new Buffer(header), contents]);
  }

  static parse(fileContents: Buffer, types: {[string]: Function}): Promise<BitObject> {
    return inflate(fileContents)
      .then((buffer) => {
        const [headers, contents] = buffer.toString().split(NULL_BYTE);
        const [type, ] = headers.split(SPACE_DELIMITER);
        return types[type].parse(contents);
      });
  }
}
