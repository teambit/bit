import Extension from './extension';
import { mapToObject } from '../utils';

export default class Container {
  constructor(private instances = new Map()) {}

  register<AnyExtension>(token: string, instance: AnyExtension) {
    this.instances.set(token, instance);
  }

  resolve<AnyExtension>(token: string): T {
    return this.instances.get(token);
  }

  static loadWith(defaults: Extension[]) {
    const extensionMap = new Map(defaults.map(extension => [extension.name, extension]));

    return new Container(extensionMap);
  }
}
// A -> B -> C
// A -> C
// instantiate A then B and C
