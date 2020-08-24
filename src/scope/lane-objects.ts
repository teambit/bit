import { toBase64ArrayBuffer } from '../utils';
import { Lane } from './models';
import BitObject from './objects/object';

export default class LaneObjects {
  lane: Buffer;
  objects: Buffer[];

  constructor(lane: Buffer, objects: Buffer[]) {
    this.lane = lane;
    this.objects = objects;
  }

  toString(): string {
    return JSON.stringify({
      lane: toBase64ArrayBuffer(this.lane),
      objects: this.objects.map(toBase64ArrayBuffer),
    });
  }

  static fromString(str: string): LaneObjects {
    return LaneObjects.fromObject(JSON.parse(str));
  }

  static fromObject(object: Record<string, any>): LaneObjects {
    const { lane, objects } = object;
    return new LaneObjects(_from64Buffer(lane), objects.map(_from64Buffer));
  }

  /**
   * prefer using `this.toObjectsAsync()` if not must to be sync.
   */
  toObjects(): { lane: Lane; objects: BitObject[] } {
    return {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      lane: BitObject.parseSync(this.lane),
      objects: this.objects.map((obj) => BitObject.parseSync(obj)),
    };
  }
  /**
   * see `this.toObject()` for the sync version
   */
  async toObjectsAsync(): Promise<{ lane: Lane; objects: BitObject[] }> {
    return {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      lane: await BitObject.parseObject(this.lane),
      objects: await Promise.all(this.objects.map((obj) => BitObject.parseObject(obj))),
    };
  }
}

function _from64Buffer(val): Buffer {
  return Buffer.from(val, 'base64');
}
