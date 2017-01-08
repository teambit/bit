/** @flow */
import { deflate, inflate, readFile } from '../utils';
import { NULL_BYTE, SPACE_DELIMITER } from '../constants';

export default class BitObject {
  length: number;
  type: string;

  /**
   * indexing method
   */
  hash(): Promise<string> {
    return Promise.reject('hash function must be defined..');
  }

  compress(): Promise<Buffer> {
    return inflate(this.serialize());
  }

  serialize(): Buffer {
    const header = `${this.type.toLowerCase()} ${this.length.toString()}${NULL_BYTE}$`;
    const contents = this.toString();
    return new Buffer(header + contents);
  }

  static parse(fileContents: Buffer, types: {[string]: BitObject}): Promise<BitObject> {
    return deflate(fileContents)
      .then((buffer) => {
        const [headers, contents] = buffer.toString().split(NULL_BYTE);
        const [type, ] = headers.split(SPACE_DELIMITER);
        return types[type].parse(contents);
      });
  }
}
