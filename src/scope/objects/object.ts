import { inflateSync } from 'zlib';
import Repository from './repository';
import { deflate, inflate, sha1 } from '../../utils';
import { NULL_BYTE, SPACE_DELIMITER } from '../../constants';
import Ref from './ref';
import { typesObj as types } from '../object-registrar';

function parse(buffer: Buffer, hash?: string): BitObject {
  const firstNullByteLocation = buffer.indexOf(NULL_BYTE);
  const headers = buffer.slice(0, firstNullByteLocation).toString();
  const contents = buffer.slice(firstNullByteLocation + 1, buffer.length);
  const [type] = headers.split(SPACE_DELIMITER);

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return types[type].parse(contents, hash);
}

export default class BitObject {
  validateBeforePersist = true; // validate the object before persisting
  id(): string | Buffer {
    throw new Error('id() was not implemented...');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  toBuffer(pretty?: boolean): Buffer {
    throw new Error('toBuffer() was not implemented...');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static parse(data: any, hash?: string) {
    throw new Error('parse() was not implemented...');
  }

  refs(): Ref[] {
    return [];
  }

  getHeader(buffer: Buffer): string {
    return `${this.constructor.name} ${this.hash().toString()} ${buffer.toString().length}${NULL_BYTE}`;
  }

  async collectRefs(repo: Repository): Promise<Ref[]> {
    const refsCollection = [];

    async function addRefs(object: BitObject) {
      const refs = object.refs();
      const objs = await Promise.all(refs.map(ref => ref.load(repo, true)));
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      refsCollection.push(...refs);
      await Promise.all(objs.map(obj => addRefs(obj)));
    }

    await addRefs(this);
    return refsCollection;
  }

  async collectRaw(repo: Repository): Promise<Buffer[]> {
    const refs = await this.collectRefs(repo);
    return Promise.all(refs.map(ref => ref.loadRaw(repo)));
  }

  asRaw(repo: Repository): Promise<Buffer> {
    return repo.loadRaw(this.hash());
  }

  collect(repo: Repository): BitObject[] {
    const objects: BitObject[] = [];

    function addRefs(object: BitObject) {
      const objs = object.refs().map(ref => {
        return ref.loadSync(repo);
      });

      objects.concat(objs);
      objs.forEach(obj => addRefs(obj));
    }

    addRefs(this);
    return objects;
  }

  /**
   * indexing method
   */
  hash(): Ref {
    // console.log(`sha ${sha1(this.id())}, id ${this.id()}`); // uncomment when debugging hash issues
    return new Ref(BitObject.makeHash(this.id()));
  }

  compress(): Promise<Buffer> {
    return deflate(this.serialize());
  }

  serialize(): Buffer {
    const buffer = this.toBuffer();
    return Buffer.concat([Buffer.from(this.getHeader(buffer)), buffer]);
  }

  /**
   * see `this.parseSync` for the sync version
   */
  static parseObject(fileContents: Buffer, hash?: string): Promise<BitObject> {
    return inflate(fileContents).then(buffer => parse(buffer, hash));
  }

  /**
   * prefer using `this.parseObject()`, unless it must be sync.
   */
  static parseSync(fileContents: Buffer, hash?: string): BitObject {
    const buffer = inflateSync(fileContents);
    return parse(buffer, hash);
  }

  static makeHash(str: string | Buffer): string {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return sha1(str);
  }
}
