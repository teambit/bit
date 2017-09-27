/** @flow */
import BitObject from './objects/object';
import Repository from './objects/repository';
import { toBase64ArrayBuffer } from '../utils';

export default class ComponentObjects {
  component: Buffer;
  objects: Buffer[];

  constructor(component: Buffer, objects: Buffer[]) {
    this.component = component;
    this.objects = objects;
  }

  // @TODO optimize ASAP.
  toString2(): string {
    return JSON.stringify({
      component: this.component,
      objects: this.objects
    });
  }

  toString3(): string {
    return JSON.stringify({
      component: this.component.toString(),
      objects: this.objects.map(obj => obj.toString('base64'))
    });
  }

  toString4(): string {
    return JSON.stringify({
      component: this.component.toString(),
      objects: this.objects.map(toBase64ArrayBuffer)
    });
  }

  toString(): string {
    return JSON.stringify({
      component: this.component.toString(),
      objects: this.objects.map(obj => obj.toString('binary'))
    });
  }

  // @TODO optimize ASAP.
  static fromString(str: string): ComponentObjects {
    return ComponentObjects.fromObject(JSON.parse(str));
  }

  static manyToString(componentsAndObjects: Array<{ component: Buffer, objects: Buffer[] }>) {
    // console.log(componentsAndObjects.length);
    const result1 = JSON.stringify(componentsAndObjects.map(componentAndObject => componentAndObject.toString()));
    const result2 = JSON.stringify(componentsAndObjects.map(componentAndObject => componentAndObject.toString2()));
    const result3 = JSON.stringify(componentsAndObjects.map(componentAndObject => componentAndObject.toString3()));
    const result4 = JSON.stringify(componentsAndObjects.map(componentAndObject => componentAndObject.toString4()));
    console.log('result1: ', result1.length);
    console.log('result2: ', result2.length);
    console.log('result3: ', result3.length);
    console.log('result4: ', result4.length);
    console.log('result8: ', JSON.stringify(componentsAndObjects).length);
    return JSON.stringify(result3);
  }

  static manyFromString(str: string): ComponentObjects[] {
    return JSON.parse(str).map(componentObject => ComponentObjects.fromObject(componentObject));
  }

  static fromObject(object: Object): ComponentObjects {
    const { component, objects } = object;

    return new ComponentObjects(new Buffer(component), objects.map(obj => new Buffer(obj)));
  }

  toObjects(repo: Repository): { component: BitObject, objects: BitObject[] } {
    return {
      component: BitObject.parseSync(this.component, repo.types),
      objects: this.objects.map(obj => BitObject.parseSync(obj, repo.types))
    };
  }
}
