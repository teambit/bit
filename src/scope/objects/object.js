/** @flow */
import { inflateSync } from 'zlib';
import type Repository from './repository';
import { deflate, inflate, sha1 } from '../../utils';
import { NULL_BYTE, SPACE_DELIMITER } from '../../constants';
import Ref from './ref';
// import logger from '../../logger/logger';

function parse(buffer: Buffer, types: { [string]: Function }): BitObject {
  const firstNullByteLocation = buffer.indexOf(NULL_BYTE);
  const headers = buffer.slice(0, firstNullByteLocation).toString();
  const contents = buffer.slice(firstNullByteLocation + 1, buffer.length);
  const [type] = headers.split(SPACE_DELIMITER);

  return types[type].parse(contents);
}

export default class BitObject {
  validateBeforePersist: boolean = true; // validate the object before persisting
  id(): string | Buffer {
    throw new Error('id() was not implemented...');
  }

  // eslint-disable-next-line no-unused-vars
  toBuffer(pretty?: boolean): Buffer {
    throw new Error('toBuffer() was not implemented...');
  }

  // eslint-disable-next-line no-unused-vars
  static parse(data: *) {
    throw new Error('parse() was not implemented...');
  }

  refs(): Ref[] {
    return [];
  }

  getHeader(buffer: Buffer): string {
    return `${this.constructor.name} ${this.hash().toString()} ${buffer.toString().length}${NULL_BYTE}`;
  }

  collectRefs(repo: Repository, throws: boolean = true): Ref[] {
    const refsCollection = [];

    function addRefs(object: BitObject) {
      const refs = object.refs();
      const objs = refs
        .map((ref) => {
          return ref.loadSync(repo, throws);
        })
        .filter(x => x);

      refsCollection.push(...refs);
      // $FlowFixMe
      objs.forEach(obj => addRefs(obj));
    }

    addRefs(this);
    return refsCollection;
  }

  collectExistingRefs(repo: Repository, throws: boolean = true): Ref[] {
    const refsCollection = [];

    function addRefs(object: BitObject) {
      const refs = object.refs();
      const objs = refs
        .map((ref) => {
          return ref.loadSync(repo, throws);
        })
        .filter(x => x);
      const filtered = refs.filter(ref => repo.loadSync(ref, false));
      refsCollection.push(...filtered);
      // $FlowFixMe
      objs.forEach(obj => addRefs(obj));
    }

    addRefs(this);
    return refsCollection;
  }
  collectRaw(repo: Repository): Promise<Buffer[]> {
    return Promise.all(this.collectRefs(repo).map(ref => ref.loadRaw(repo)));
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

      objects.concat(objs);
      // $FlowFixMe
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

  static parseObject(fileContents: Buffer, types: { [string]: Function }): Promise<BitObject> {
    return inflate(fileContents).then(buffer => parse(buffer, types));
  }

  static parseSync(fileContents: Buffer, types: { [string]: Function }): BitObject {
    const buffer = inflateSync(fileContents);
    return parse(buffer, types);
  }

  static makeHash(str: string | Buffer): string {
    return sha1(str);
  }
}
