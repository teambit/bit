/** @flow */
import BitObject from './objects/object';
import Repository from './objects/repository';

export default class ComponentObjects {
  component: Buffer;
  objects: Buffer[];

  constructor(component: Buffer, objects: Buffer[]) {
    this.component = component;
    this.objects = objects;
  }

  toString(): string {
    const componentStr = this.component.toString();
    const objectsStr = this.objects
      .map(obj => obj.toString())
      .join(':::');

    return [componentStr, objectsStr].join('+++');
  }

  fromString(str: string): ComponentObjects {
    const [componentStr, objectsStr] = str.split('+++');
    const objects = objectsStr
      .split(':::')
      .map(objStr => Buffer.from(objStr));

    return new ComponentObjects(
      Buffer.from(componentStr), 
      objects
    );
  }

  toObjects(repo: Repository) {
    return {
      component: BitObject.parseSync(this.component, repo.types),
      objects: this.objects.map(obj => BitObject.parseSync(obj, repo.types))
    };
  }
}
