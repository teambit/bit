import R from 'ramda';

import { NULL_BYTE, SPACE_DELIMITER } from '../../constants';
import { getStringifyArgs, inflate } from '../../utils';
import { typesObj as types } from '../object-registrar';
import { BitObject } from '.';

export default class BitRawObject {
  headers: string[];
  type: string;
  content: Buffer;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  parsedContent: any;
  _ref: string;

  constructor(
    buffer: Buffer,
    ref: string | null | undefined,
    type: string | null | undefined,
    content: Buffer | null | undefined,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    parsedContent: any | null | undefined
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
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.type = type || typeFromHeader;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this._ref = ref;
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

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  set ref(ref: string) {
    this._ref = ref;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get ref(): string {
    return this._ref;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get id(): string {
    switch (this.type) {
      case 'Version':
        return 'component version';
      case 'Component':
        return this.parsedContent.scope
          ? [this.parsedContent.scope, this.parsedContent.name].join('/')
          : this.parsedContent.name;
      case 'Symlink':
        return this.parsedContent.name;
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
      const files = this.parsedContent.files ? this.parsedContent.files.map((file) => file.file) : [];
      const dists = this.parsedContent.dists ? this.parsedContent.dists.map((dist) => dist.file) : [];
      return [...dists, ...files].filter((ref) => ref);
    }

    return [];
  }

  static async fromDeflatedBuffer(
    fileContents: Buffer,
    ref: string | null | undefined
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  ): Promise<BitObject> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return inflate(fileContents).then((buffer) => new BitRawObject(buffer, ref));
  }

  /**
   * Build a real object (model) from a parsed content (can be the original parsed conents or a provided one)
   * We use the provided version during the migration process when we change the parsed content outside
   * @param {Any} parsedContent
   */
  toRealObject() {
    // @ts-ignore
    return types[this.type].from(this.parsedContent || this.getParsedContent(), this.headers[1]);
  }

  clone() {
    const parsedContent = this.parsedContent ? R.clone(this.parsedContent) : undefined;
    // TODO: Should also clone the buffers (content)
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new BitRawObject(undefined, this._ref, this.type, this.content, parsedContent);
  }
}
