/* eslint-disable max-classes-per-file */
import { Slot } from '@teambit/harmony';
import { GraphQLExtension } from '../graphql';
import { componentSchema } from './component.graphql';
import { ScopeExtension } from '../scope';
import { ComponentFactory } from './component-factory';

export type ConfigFunc = () => any;

export class ComponentExtension {
  static id = '@teambit/component';

  static slots = [Slot.withType<ComponentFactory>()];

  static dependencies = [GraphQLExtension, ScopeExtension];

  static async provider([graphql]: [GraphQLExtension]) {
    graphql.register(componentSchema());
    return new ComponentExtension();
  }
}

export default ComponentExtension;
