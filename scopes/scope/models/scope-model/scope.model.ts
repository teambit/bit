import { ComponentModel, ComponentModelProps } from '@teambit/component';
import { ComponentDescriptor } from '@teambit/component-descriptor';
import { ComponentID } from '@teambit/component-id';

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
    readonly components: ComponentModel[],

    /**
     * components contained in the scope.
     */
    readonly componentDescriptors: ComponentDescriptor[]
  ) {}

  static from({ scope }: { scope: ScopeModelProps }) {
    const components = scope.components || [];
    const componentDescriptors = scope.components.map((component) => {
      const id = ComponentID.fromObject(component.id);
      return ComponentDescriptor.fromObject({ id: id.toString() });
    });

    return new ScopeModel(
      scope.name,
      scope.icon,
      scope.backgroundIconColor,
      scope.description,
      components.map((component) => ComponentModel.from(component)),
      componentDescriptors
    );
  }

  static empty() {
    return new ScopeModel('', '', '', '', [], []);
  }
}
