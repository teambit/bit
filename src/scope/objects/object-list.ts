import tarStream from 'tar-stream';
import pMap from 'p-map';
import { BitObject } from '.';
import { BitObjectList } from './bit-object-list';
import Ref from './ref';
import { CONCURRENT_IO_LIMIT } from '../../constants';

export type ObjectItem = {
  ref: Ref;
  buffer: Buffer; // zlib deflated BitObject
  type?: string; // for future use. e.g. to be able to export only Component/Version types but not Source/Artifact, etc.
  scope?: string; // used for the export process
};

export const FETCH_FORMAT_OBJECT_LIST = 'ObjectList';

export class ObjectList {
  constructor(public objects: ObjectItem[] = []) {}

  count() {
    return this.objects.length;
  }

  static mergeMultipleInstances(objectLists: ObjectList[]): ObjectList {
    const objectList = new ObjectList();
    objectLists.forEach((objList) => objectList.mergeObjectList(objList));
    return objectList;
  }
  mergeObjectList(objectList: ObjectList) {
    this.addIfNotExist(objectList.objects);
  }
  static fromJsonString(jsonStr: string): ObjectList {
    const jsonParsed = JSON.parse(jsonStr);
    if (!Array.isArray(jsonParsed)) {
      throw new Error(`fromJsonString expect an array, got ${typeof jsonParsed}`);
    }
    jsonParsed.forEach((obj) => {
      obj.ref = new Ref(obj.ref.hash);
      obj.buffer = Buffer.from(obj.buffer);
    });
    return new ObjectList(jsonParsed);
  }
  toJsonString(): string {
    return JSON.stringify(this.objects);
  }
  toTar(): NodeJS.ReadableStream {
    const pack = tarStream.pack();
    this.objects.forEach((obj) => {
      pack.entry({ name: this.combineScopeAndHash(obj) }, obj.buffer);
    });
    pack.finalize();
    return pack;
  }
  static async fromTar(packStream: NodeJS.ReadableStream): Promise<ObjectList> {
    const extract = tarStream.extract();
    const objectItems: ObjectItem[] = await new Promise((resolve, reject) => {
      const objects: ObjectItem[] = [];
      extract.on('entry', (header, stream, next) => {
        const data: Buffer[] = [];
        stream.on('data', (chunk) => {
          data.push(chunk);
        });
        stream.on('end', () => {
          objects.push({ ...ObjectList.extractScopeAndHash(header.name), buffer: Buffer.concat(data) });
          next(); // ready for next entry
        });
        stream.on('error', (err) => reject(err));

        stream.resume(); // just auto drain the stream
      });

      extract.on('finish', () => {
        resolve(objects);
      });

      packStream.pipe(extract);
    });
    return new ObjectList(objectItems);
  }

  /**
   * the opposite of this.combineScopeAndHash
   */
  static extractScopeAndHash(name: string): { scope?: string; ref: Ref } {
    const nameSplit = name.split('/');
    const hasScope = nameSplit.length > 1;
    return {
      scope: hasScope ? nameSplit[0] : undefined,
      ref: new Ref(hasScope ? nameSplit[1] : nameSplit[0]),
    };
  }
  /**
   * the opposite of this.extractScopeAndHash
   */
  combineScopeAndHash(objectItem: ObjectItem): string {
    const scope = objectItem.scope ? `${objectItem.scope}/` : '';
    return `${scope}${objectItem.ref.hash}`;
  }

  addIfNotExist(objectItems: ObjectItem[]) {
    objectItems.forEach((objectItem) => {
      const exists = this.objects.find(
        (object) => object.ref.isEqual(objectItem.ref) && object.scope === objectItem.scope
      );
      if (!exists) {
        this.objects.push(objectItem);
      }
    });
  }

  async toBitObjects(): Promise<BitObjectList> {
    const bitObjects = await pMap(this.objects, (object) => BitObject.parseObject(object.buffer), {
      concurrency: CONCURRENT_IO_LIMIT,
    });
    return new BitObjectList(bitObjects);
  }

  static async fromBitObjects(bitObjects: BitObject[]): Promise<ObjectList> {
    const objectItems = await pMap(
      bitObjects,
      async (obj) => ({
        ref: obj.hash(),
        buffer: await obj.compress(),
        type: obj.getType(),
      }),
      { concurrency: CONCURRENT_IO_LIMIT }
    );
    return new ObjectList(objectItems);
  }

  addScopeName(scopeName: string) {
    this.objects.forEach((object) => {
      object.scope = scopeName;
    });
  }

  splitByScopeName(): { [scopeName: string]: ObjectList } {
    const objectListPerScope: { [scopeName: string]: ObjectList } = {};
    this.objects.forEach((obj) => {
      if (!obj.scope) {
        throw new Error(`ObjectList: unable to split by scopeName, the scopeName is missing for ${obj.ref.hash}`);
      }
      if (objectListPerScope[obj.scope]) {
        objectListPerScope[obj.scope].addIfNotExist([obj]);
      } else {
        objectListPerScope[obj.scope] = new ObjectList([obj]);
      }
    });
    return objectListPerScope;
  }

  /**
   * helps debugging
   */
  toConsoleLog() {
    console.log(this.objects.map((o) => o.ref.hash).join('\n')); // eslint-disable-line no-console
  }
}
