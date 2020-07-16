/* eslint-disable max-classes-per-file */
import { Slot } from '@teambit/harmony';
import { GraphQLExtension } from '../graphql';
import { componentSchema } from './component.graphql';
import { ComponentFactory } from './component-factory';

export type ConfigFunc = () => any;

export class ComponentExtension {
  static id = '@teambit/component';

  static slots = [Slot.withType<ComponentFactory>()];

  static dependencies = [GraphQLExtension];

  static async provider([graphql]: [GraphQLExtension]) {
    graphql.register(componentSchema());
    return new ComponentExtension();
  }
}

export default ComponentExtension;
