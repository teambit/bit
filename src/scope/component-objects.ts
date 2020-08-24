import { toBase64ArrayBuffer } from '../utils';
import ModelComponent from './models/model-component';
import BitObject from './objects/object';

export default class ComponentObjects {
  component: Buffer;
  objects: Buffer[];

  constructor(component: Buffer, objects: Buffer[]) {
    this.component = component;
    this.objects = objects;
  }

  toString(): string {
    return JSON.stringify({
      component: toBase64ArrayBuffer(this.component),
      objects: this.objects.map(toBase64ArrayBuffer),
    });
  }

  // Used mainly by server side hooks
  getParsedComponent(): BitObject {
    const component = BitObject.parseSync(this.component);
    return component;
  }

  // @TODO optimize ASAP.
  static fromString(str: string): ComponentObjects {
    return ComponentObjects.fromObject(JSON.parse(str));
  }

  static manyToString(componentsAndObjects: Array<{ component: Buffer; objects: Buffer[] }>) {
    const result = JSON.stringify(componentsAndObjects.map((componentAndObject) => componentAndObject.toString()));
    return result;
  }

  static manyFromString(str: string): ComponentObjects[] {
    return JSON.parse(str).map((componentObject) => ComponentObjects.fromString(componentObject));
  }

  static fromObject(object: Record<string, any>): ComponentObjects {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const { component, objects } = object;

    return new ComponentObjects(_from64Buffer(component), objects.map(_from64Buffer));
  }

  /**
   * prefer using `this.toObjectsAsync()` if not must to be sync.
   */
  toObjects(): { component: ModelComponent; objects: BitObject[] } {
    return {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      component: BitObject.parseSync(this.component),
      objects: this.objects.map((obj) => BitObject.parseSync(obj)),
    };
  }
  /**
   * see `this.toObject()` for the sync version
   */
  async toObjectsAsync(): Promise<{ component: ModelComponent; objects: BitObject[] }> {
    return {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      component: await BitObject.parseObject(this.component),
      objects: await Promise.all(this.objects.map((obj) => BitObject.parseObject(obj))),
    };
  }
}

function _from64Buffer(val): Buffer {
  return Buffer.from(val, 'base64');
}
