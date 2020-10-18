import R from 'ramda';

import ComponentObjects from './component-objects';
import LaneObjects from './lane-objects';
import { BitObject } from './objects';
import { ObjectList } from './objects/object-list';

export default class CompsAndLanesObjects {
  componentsObjects: ComponentObjects[];
  laneObjects: LaneObjects[];

  constructor(componentsObjects: ComponentObjects[], laneObjects: LaneObjects[]) {
    this.componentsObjects = componentsObjects;
    this.laneObjects = laneObjects;
  }

  toString() {
    const components = this.componentsObjects.map((componentAndObject) => componentAndObject.toString());
    if (!this.laneObjects.length) {
      // @todo: delete this `if` block before releasing v15
      // backward compatibility, before v15, it used to be an array of component-objects
      // this makes sure that old clients could run "bit import"
      return JSON.stringify(components);
    }
    return JSON.stringify({
      components,
      lanes: this.laneObjects.map((laneObj) => laneObj.toString()),
    });
  }

  toObjectList(): ObjectList {
    const objectList = new ObjectList();
    this.componentsObjects.forEach((compObj) => {
      const buffers = [compObj.component, ...compObj.objects];
      const objItems = buffers.map((buffer) => {
        const obj = BitObject.parseSync(buffer);
        return { ref: obj.hash(), buffer };
      });
      objectList.addIfNotExist(objItems);
    });
    return objectList;
  }

  static fromString(str: string) {
    const parsed = JSON.parse(str);
    let components;
    let lanes = [];
    if (Array.isArray(parsed)) {
      // @todo: delete this `if` block before releasing v15
      // backward compatibility, before v15, it used to be an array of component-objects
      // this makes sure that old clients could run "bit export"
      components = parsed;
    } else {
      components = parsed.components;
      lanes = parsed.lanes;
    }
    const componentsObjects = components.map((componentObject) => ComponentObjects.fromString(componentObject));
    const laneObjects = lanes.map((laneObj) => LaneObjects.fromString(laneObj));
    return new CompsAndLanesObjects(componentsObjects, laneObjects);
  }

  static flatten(manyCompsAndLanesObjects: CompsAndLanesObjects[]): CompsAndLanesObjects {
    return new CompsAndLanesObjects(
      R.flatten(manyCompsAndLanesObjects.map((m) => m.componentsObjects)),
      R.flatten(manyCompsAndLanesObjects.map((m) => m.laneObjects))
    );
  }
}
