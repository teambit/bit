import tarStream from 'tar-stream';
import pMap from 'p-map';
import { Readable, PassThrough, pipeline } from 'stream';
import { BitObject } from '.';
import { BitObjectList } from './bit-object-list';
import Ref from './ref';
import logger from '../../logger/logger';
import { concurrentIOLimit } from '../../utils/concurrency';

/**
 * when error occurred during streaming between HTTP server and client, there is no good way to
 * indicate this other than sending a new file with a special name and the error message.
 */
const TAR_STREAM_ERROR_FILENAME = '.BIT.ERROR';
/**
 * schema 1.0.0 - added the start and end file with basic info
 */
const OBJECT_LIST_CURRENT_SCHEMA = '1.0.0';
const TAR_STREAM_START_FILENAME = '.BIT.START';
const TAR_STREAM_END_FILENAME = '.BIT.END';

type StartFile = {
  schema: string;
  scopeName: string;
};
type EndFile = {
  numOfFiles: number;
  scopeName: string;
};

export type ObjectItem = {
  ref: Ref;
  buffer: Buffer; // zlib deflated BitObject
  type?: string; // for future use. e.g. to be able to export only Component/Version types but not Source/Artifact, etc.
  scope?: string; // used for the export process
};

export const FETCH_FORMAT_OBJECT_LIST = 'ObjectList';

/**
 * Stream.Readable that operates with objectMode, while each 'data' event emits one ObjectItem object.
 */
export type ObjectItemsStream = Readable;

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
      pack.entry({ name: ObjectList.combineScopeAndHash(obj) }, obj.buffer);
    });
    pack.finalize();
    return pack;
  }
  toReadableStream(): ObjectItemsStream {
    return Readable.from(this.objects);
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

  static fromTarToObjectStream(packStream: NodeJS.ReadableStream): ObjectItemsStream {
    const passThrough = new PassThrough({ objectMode: true });
    const extract = tarStream.extract();
    let startData: StartFile | undefined;
    let endData: EndFile | undefined;
    extract.on('entry', (header, stream, next) => {
      const data: Buffer[] = [];
      stream.on('data', (chunk) => {
        data.push(chunk);
      });
      stream.on('end', () => {
        const allData = Buffer.concat(data);
        if (header.name === TAR_STREAM_ERROR_FILENAME) {
          passThrough.emit('error', new Error(allData.toString()));
          return;
        }
        if (header.name === TAR_STREAM_START_FILENAME) {
          startData = JSON.parse(allData.toString());
          logger.debug('fromTarToObjectStream, start getting data', startData);
          next();
          return;
        }
        if (header.name === TAR_STREAM_END_FILENAME) {
          endData = JSON.parse(allData.toString());
          logger.debug('fromTarToObjectStream, finished getting data', endData);
          next();
          return;
        }
        passThrough.write({ ...ObjectList.extractScopeAndHash(header.name), buffer: allData });
        next(); // ready for next entry
      });
      stream.on('error', (err) => {
        passThrough.emit('error', err);
      });

      stream.resume(); // just auto drain the stream
    });

    // not sure if needed
    extract.on('error', (err) => {
      passThrough.emit('error', err);
    });

    extract.on('finish', () => {
      if (startData?.schema === OBJECT_LIST_CURRENT_SCHEMA && !endData) {
        // wasn't able to find a better way to indicate whether the server aborted the request
        // see https://github.com/node-fetch/node-fetch/issues/1117
        passThrough.emit(
          'error',
          new Error(`server terminated the stream unexpectedly (metadata: ${JSON.stringify(startData)})`)
        );
      }
      passThrough.end();
    });
    pipeline(packStream, extract, (err) => {
      if (err) {
        logger.error('fromTarToObjectStream, pipeline', err);
        passThrough.emit('error', err);
      } else {
        logger.debug('fromTarToObjectStream, pipeline is completed');
      }
    });

    return passThrough;
  }

  static fromObjectStreamToTar(readable: Readable, scopeName: string) {
    const pack = tarStream.pack();
    const startFile: StartFile = { schema: OBJECT_LIST_CURRENT_SCHEMA, scopeName };
    logger.debug('fromObjectStreamToTar, start sending data', startFile);
    pack.entry({ name: TAR_STREAM_START_FILENAME }, JSON.stringify(startFile));
    let numOfFiles = 0;
    readable.on('data', (obj: ObjectItem) => {
      numOfFiles += 1;
      pack.entry({ name: ObjectList.combineScopeAndHash(obj) }, obj.buffer);
    });
    readable.on('end', () => {
      const endFile: EndFile = { numOfFiles, scopeName };
      logger.debug('fromObjectStreamToTar, finished sending data', endFile);
      pack.entry({ name: TAR_STREAM_END_FILENAME }, JSON.stringify(endFile));
      pack.finalize();
    });
    readable.on('error', (err) => {
      const errorMessage = err.message || `unexpected error (${err.name})`;
      logger.error(`ObjectList.fromObjectStreamToTar, streaming an error as a file`, err);
      pack.entry({ name: TAR_STREAM_ERROR_FILENAME }, errorMessage);
      pack.finalize();
    });
    return pack;
  }

  static async fromReadableStream(readable: ObjectItemsStream): Promise<ObjectList> {
    const objectItems: ObjectItem[] = [];
    for await (const obj of readable) {
      objectItems.push(obj);
    }
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
  static combineScopeAndHash(objectItem: ObjectItem): string {
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
    const concurrency = concurrentIOLimit();
    const bitObjects = await pMap(this.objects, (object) => BitObject.parseObject(object.buffer), {
      concurrency,
    });
    return new BitObjectList(bitObjects);
  }

  static async fromBitObjects(bitObjects: BitObject[]): Promise<ObjectList> {
    const concurrency = concurrentIOLimit();
    const objectItems = await pMap(
      bitObjects,
      async (obj) => ({
        ref: obj.hash(),
        buffer: await obj.compress(),
        type: obj.getType(),
      }),
      { concurrency }
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
