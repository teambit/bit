import { ComponentMeta } from '../../../component/component-meta';

export class ScopeModel {
  constructor(
    /**
     * the scope name.
     */
    readonly name: string,

    readonly components: ComponentMeta[]
  ) {}

  static from(object: any) {
    const components = object.scope.components || [];
    return new ScopeModel(
      object.scope.name,
      components.map((component) => ComponentMeta.from(component))
    );
  }
}
