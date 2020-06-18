// import { Component } from '../component';

export class Compositions {
  static id = '@teambit/compositions';
  static dependencies = [];

  // parse(component: Component) {
  // const files = component.filesystem.toObject();
  // Object.keys(files);
  // }

  static async provider() {
    return new Compositions();
  }
}
