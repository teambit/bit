import { ComponentModel, ComponentModelProps } from '@teambit/component';

export type ScopeModelProps = {
  name: string;
  icon: string;
  backgroundIconColor: string;
  description: string;
  components: ComponentModelProps[];
};

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
     * background icon color
     */
    readonly backgroundIconColor: string,

    /**
     * description of the scope
     */
    readonly description: string,

    /**
     * components contained in the scope.
     */
    readonly components: ComponentModel[]
  ) {}

  static from({ scope }: { scope: ScopeModelProps }) {
    const components = scope.components || [];
    return new ScopeModel(
      scope.name,
      scope.icon,
      scope.description,
      scope.backgroundIconColor,
      components.map((component) => ComponentModel.from(component))
    );
  }

  static empty() {
    return new ScopeModel('', '', '', '', []);
  }
}
