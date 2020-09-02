import { ComponentModel } from '../ui';

export class ComponentHostModel {
  constructor(readonly name: string, readonly components: ComponentModel[]) {}

  static from(data: any) {
    return new ComponentHostModel(data.getHost.name, ComponentModel.fromArray(data.getHost.list));
  }
}
