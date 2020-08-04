import { flatten } from 'lodash';
/* eslint-disable max-classes-per-file */
import { Slot, SlotRegistry } from '@teambit/harmony';
import { GraphQLExtension } from '../graphql';
import { componentSchema } from './component.graphql';
import { ComponentFactory } from './component-factory';
import { HostNotFound } from './exceptions';
import { Route, ExpressExtension } from '../express';
import { ComponentRoute } from './component.route';

export type ComponentHostSlot = SlotRegistry<ComponentFactory>;

export class ComponentExtension {
  static id = '@teambit/component';

  constructor(
    /**
     * slot for component hosts to register.
     */
    private hostSlot: ComponentHostSlot,

    /**
     * Express Extension
     */
    private express: ExpressExtension
  ) {}

  /**
   * register a new component host.
   */
  registerHost(host: ComponentFactory) {
    this.hostSlot.register(host);
    return this;
  }

  registerRoute(routes: Route[]) {
    const routeEntries = routes.map((route: Route) => {
      return new ComponentRoute(route, this);
    });

    this.express.register(flatten(routeEntries));
    return this;
  }

  /**
   * get component host by extension ID.
   */
  getHost(id: string): ComponentFactory {
    const host = this.hostSlot.get(id);
    if (!host) throw new HostNotFound();
    return host;
  }

  static slots = [Slot.withType<ComponentFactory>(), Slot.withType<Route[]>()];

  static dependencies = [GraphQLExtension, ExpressExtension];

  static async provider(
    [graphql, express]: [GraphQLExtension, ExpressExtension],
    config,
    [hostSlot]: [ComponentHostSlot]
  ) {
    const componentExtension = new ComponentExtension(hostSlot, express);
    graphql.register(componentSchema(componentExtension));

    return componentExtension;
  }
}

export default ComponentExtension;
