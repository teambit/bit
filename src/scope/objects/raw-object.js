/** @flow */
import R from 'ramda';
import { inflate, getStringifyArgs } from '../../utils';
import { NULL_BYTE, SPACE_DELIMITER } from '../../constants';

export default class BitRawObject {
  headers: string[];
  type: string;
  content: Buffer;
  parsedContent: Any;
  types: { [string]: Function };
  _ref: string;

  constructor(
    buffer: Buffer,
    ref: ?string,
    types: ?{ [string]: Function },
    type: ?string,
    content: ?Buffer,
    parsedContent: ?Any
  ) {
    let headers;
    let contentFromBuffer;
    if (buffer) {
      const firstNullByteLocation = buffer.indexOf(NULL_BYTE);
      headers = buffer.slice(0, firstNullByteLocation).toString();
      contentFromBuffer = buffer.slice(firstNullByteLocation + 1, buffer.length);
    }
    this.content = content || contentFromBuffer;
    this.headers = headers ? headers.split(SPACE_DELIMITER) : undefined;
    const typeFromHeader = this.headers ? this.headers[0] : undefined;
    this.type = type || typeFromHeader;
    this._ref = ref;
    this.types = types;
    this.parsedContent = parsedContent || this.getParsedContent();
  }

  getParsedContent() {
    if (this.parsedContent) return this.parsedContent;
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

  getString(pretty: boolean) {
    const args = getStringifyArgs(pretty);
    switch (this.type) {
      case 'Version':
      case 'Component':
      case 'Symlink':
      case 'ScopeMeta':
        return JSON.stringify(this.parsedContent, ...args);

      default:
        return this.content;
    }
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

  refs(): string[] {
    if (this.type === 'Component') {
      return R.values(this.parsedContent.versions);
    }
    if (this.type === 'Version') {
      const files = this.parsedContent.files ? this.parsedContent.files.map(file => file.file) : [];
      const dists = this.parsedContent.dists ? this.parsedContent.dists.map(dist => dist.file) : [];
      return [...dists, ...files].filter(ref => ref);
    }

    return [];
  }

  static async fromDeflatedBuffer(
    fileContents: Buffer,
    ref: ?string,
    types: ?{ [string]: Function }
  ): Promise<BitObject> {
    return inflate(fileContents).then(buffer => new BitRawObject(buffer, ref, types));
  }

  /**
   * Build a real object (model) from a parsed content (can be the original parsed conents or a provided one)
   * We use the provided version during the migration process when we change the parsed content outside
   * @param {Any} parsedContent 
   */
  toRealObject() {
    return this.types[this.type].from(this.parsedContent || this.getParsedContent());
  }

  clone() {
    const types = this.types ? R.clone(this.types) : undefined;
    const parsedContent = this.parsedContent ? R.clone(this.parsedContent) : undefined;
    // TODO: Should also clone the buffers (content)
    return new BitRawObject(undefined, this._ref, types, this.type, this.content, parsedContent);
  }
}
