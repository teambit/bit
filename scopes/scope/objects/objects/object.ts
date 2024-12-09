import { inflateSync } from 'zlib';

import { NULL_BYTE, SPACE_DELIMITER } from '@teambit/legacy.constants';
import { deflate, inflate } from '@teambit/legacy.utils';
import { sha1 } from '@teambit/toolbox.crypto.sha1';
import { UnknownObjectType, typesObj as types } from '@teambit/legacy.scope';
import { ObjectItem } from './object-list';
import Ref from './ref';
import Repository from './repository';

function parse(buffer: Buffer): BitObject {
  const { type, hash, contents } = extractHeaderAndContent(buffer);
  if (!types[type]) throw new UnknownObjectType(type);
  return types[type].parse(contents, hash);
}

function extractHeaderAndContent(buffer: Buffer): { type: string; hash: string; contents: Buffer } {
  const firstNullByteLocation = buffer.indexOf(NULL_BYTE);
  const headers = buffer.slice(0, firstNullByteLocation).toString();
  const [type, hash] = headers.split(SPACE_DELIMITER);
  const contents = buffer.slice(firstNullByteLocation + 1, buffer.length);
  return { type, hash, contents };
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
      } catch (err: any) {
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
    return Buffer.concat([Buffer.from(this.getHeader(buffer)), buffer] as unknown as Uint8Array[]);
  }

  /**
   * see `this.parseSync` for the sync version
   */
  static async parseObject(fileContents: Buffer, filePath?: string): Promise<BitObject> {
    const buffer = await inflate(fileContents, filePath);
    return parse(buffer);
  }

  /**
   * same as `parseObject`, however, if the type is not one of the given "typeNames", it returns null.
   * the performance improvement is huge compare to "parseObject", as it doesn't parse the object if not needed.
   */
  static async parseObjectOnlyIfType(
    fileContents: Buffer,
    typeNames: string[],
    filePath?: string
  ): Promise<BitObject | null> {
    const buffer = await inflate(fileContents, filePath);
    const { type } = extractHeaderAndContent(buffer);
    if (typeNames.includes(type)) return parse(buffer);
    return null;
  }

  /**
   * prefer using `this.parseObject()`, unless it must be sync.
   */
  static parseSync(fileContents: Buffer): BitObject {
    // todo: fix after merging #9359
    const buffer = inflateSync(fileContents);
    return parse(buffer);
  }

  static makeHash(str: string | Buffer): string {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return sha1(str);
  }
}
