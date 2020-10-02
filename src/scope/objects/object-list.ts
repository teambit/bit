import { BitObject } from '.';
import { BitObjectList } from './bit-object-list';
import Ref from './ref';

export type ObjectItem = {
  ref: Ref;
  buffer: Buffer; // zlib deflated BitObject
  type?: string; // for future use. e.g. to be able to export only Component/Version types but not Source/Artifact, etc.
};

export const FETCH_FORMAT_OBJECT_LIST = 'ObjectList';

export class ObjectList {
  constructor(public objects: ObjectItem[] = []) {}

  static mergeMultipleInstances(ObjectLists: ObjectList[]): ObjectList {
    const objectList = new ObjectList();
    ObjectLists.forEach((objList) => objectList.addIfNotExist(objList.objects));
    return objectList;
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

  addIfNotExist(objectItems: ObjectItem[]) {
    objectItems.forEach((objectItem) => {
      if (!this.objects.find((object) => object.ref.isEqual(objectItem.ref))) {
        this.objects.push(objectItem);
      }
    });
  }

  async toBitObjects(): Promise<BitObjectList> {
    const bitObjects = await Promise.all(this.objects.map((object) => BitObject.parseObject(object.buffer)));
    return new BitObjectList(bitObjects);
  }
}
