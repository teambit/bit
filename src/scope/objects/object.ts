import { inflateSync } from 'zlib';

import { NULL_BYTE, SPACE_DELIMITER } from '../../constants';
import { deflate, inflate, sha1 } from '../../utils';
import { typesObj as types } from '../object-registrar';
import { ObjectItem } from './object-list';
import Ref from './ref';
import Repository from './repository';

function parse(buffer: Buffer): BitObject {
  const firstNullByteLocation = buffer.indexOf(NULL_BYTE);
  const headers = buffer.slice(0, firstNullByteLocation).toString();
  const contents = buffer.slice(firstNullByteLocation + 1, buffer.length);
  const [type, hash] = headers.split(SPACE_DELIMITER);

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

  refs(): Ref[] {
    return [];
  }

  getType(): string {
    return this.constructor.name;
  }

  getHeader(buffer: Buffer): string {
    return `${this.getType()} ${this.hash().toString()} ${buffer.toString().length}${NULL_BYTE}`;
  }

  async collectRefs(repo: Repository): Promise<Ref[]> {
    const refsCollection = [];
    const objectType = this.getType();
    const objectId = objectType === 'Component' ? `Component ${this.id()}` : objectType;

    async function addRefs(object: BitObject) {
      const refs = object.refs();
      let objs;
      try {
        objs = await Promise.all(refs.map((ref) => ref.load(repo, true)));
      } catch (err) {
        if (err.code === 'ENOENT') {
          throw new Error(`failed finding an object file required by ${object.constructor.name} object, originated from ${objectId}
path: ${err.path}`);
        }
        throw err;
      }

      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      refsCollection.push(...refs);
      await Promise.all(objs.map((obj) => addRefs(obj)));
    }

    await addRefs(this);
    return refsCollection;
  }

  async collectRaw(repo: Repository): Promise<ObjectItem[]> {
    const refs = await this.collectRefs(repo);
    return repo.loadManyRaw(refs);
  }

  asRaw(repo: Repository): Promise<Buffer> {
    return repo.loadRaw(this.hash());
  }

  collect(repo: Repository): BitObject[] {
    const objects: BitObject[] = [];

    function addRefs(object: BitObject) {
      const objs = object.refs().map((ref) => {
        return ref.loadSync(repo);
      });

      objects.push(...objs);
      objs.forEach((obj) => addRefs(obj));
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
  static parseObject(fileContents: Buffer): Promise<BitObject> {
    return inflate(fileContents).then((buffer) => parse(buffer));
  }

  // static parse(fileContents: Buffer, types: { [key: string]: Function }): Promise<BitObject> {
  //   return Promise.resolve(parse(fileContents, types));
  // }

  /**
   * prefer using `this.parseObject()`, unless it must be sync.
   */
  static parseSync(fileContents: Buffer): BitObject {
    const buffer = inflateSync(fileContents);
    return parse(buffer);
  }

  static makeHash(str: string | Buffer): string {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return sha1(str);
  }
}
