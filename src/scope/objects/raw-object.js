/** @flow */
import { inflateSync } from 'zlib';
import Repository from './repository';
import { deflate, inflate, sha1 } from '../../utils';
import { NULL_BYTE, SPACE_DELIMITER } from '../../constants';

export default class BitRawObject {
  headers: string[];
  type: string;
  content: Buffer;
  parsedContent: Any;
  _ref: string;

  constructor(buffer: Buffer) {
    const firstNullByteLocation = buffer.indexOf(NULL_BYTE);
    const headers = buffer.slice(0, firstNullByteLocation).toString();
    this.content = buffer.slice(firstNullByteLocation + 1, buffer.length);
    this.headers = headers.split(SPACE_DELIMITER);
    const [type] = this.headers;
    this.type = type;
    this.parsedContent = this.getParsedContent();
  }

  getParsedContent() {
    let parsedContent;
    switch (this.type) {
      case 'Version':
      case 'Component':
      case 'Symlink':
      case 'ScopeMeta':
        parsedContent = JSON.parse(this.content.toString());
        break;

      default:
        parsedContent = this.content;
    }
    return parsedContent;
  }

  set ref(ref: string) {
    this._ref = ref;
  }

  get ref(): string {
    return this._ref;
  }

  get id(): string {
    switch (this.type) {
      case 'Version':
        return 'component version';
      case 'Component':
        return this.parsedContent.scope
          ? [this.parsedContent.scope, this.parsedContent.box, this.parsedContent.name].join('/')
          : [this.parsedContent.box, this.parsedContent.name].join('/');
      case 'Symlink':
        return [this.parsedContent.box, this.parsedContent.name].join('/');
      case 'ScopeMeta':
        return this.parsedContent.name;

      default:
        return 'component source file';
    }
  }

  static async fromDeflatedBuffer(fileContents: Buffer): Promise<BitObject> {
    return inflate(fileContents).then(buffer => new BitRawObject(buffer));
  }
}
