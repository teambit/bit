import ComponentObjects from './component-objects';
import LaneObjects from './lane-objects';

export default class ObjectsToPush {
  componentsObjects: ComponentObjects[];
  laneObjects: LaneObjects[];

  constructor(componentsObjects: ComponentObjects[], laneObjects: LaneObjects[]) {
    this.componentsObjects = componentsObjects;
    this.laneObjects = laneObjects;
  }

  toString() {
    return JSON.stringify({
      components: this.componentsObjects.map(componentAndObject => componentAndObject.toString()),
      lanes: this.laneObjects.map(laneObj => laneObj.toString())
    });
  }

  static fromString(str: string) {
    const parsed = JSON.parse(str);
    let components;
    let lanes = [];
    if (Array.isArray(parsed)) {
      // backward compatibility, before v15, it used to be an array of component-objects
      components = parsed;
    } else {
      components = parsed.components;
      lanes = parsed.lanes;
    }
    const componentsObjects = components.map(componentObject => ComponentObjects.fromString(componentObject));
    const laneObjects = lanes.map(laneObj => LaneObjects.fromString(laneObj));
    return new ObjectsToPush(componentsObjects, laneObjects);
  }
}
