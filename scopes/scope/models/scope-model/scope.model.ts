import { ComponentModel } from '@teambit/component';

export class ScopeModel {
  constructor(
    /**
     * the scope name.
     */
    readonly name: string,

    /**
     * the scope icon.
     */
    readonly icon: string,

    /**
     * description of the scope
     */
    readonly description: string,

    /**
     * components contained in the scope.
     */
    readonly components: ComponentModel[]
  ) {}

  static from(object: any) {
    const components = object.scope.components || [];
    return new ScopeModel(
      object.scope.name,
      object.scope.icon,
      object.scope.description,
      components.map((component) => ComponentModel.from(component))
    );
  }

  static empty() {
    return new ScopeModel('', '', '', []);
  }
}
