import { MainRuntime } from '@teambit/cli';
import { ExpressAspect, ExpressMain, Route } from '@teambit/express';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { flatten } from 'lodash';
import { ExtensionDataList } from 'bit-bin/dist/consumer/config';

import { ComponentFactory } from './component-factory';
import { ComponentAspect } from './component.aspect';
import { componentSchema } from './component.graphql';
import { ComponentRoute } from './component.route';
import { AspectList } from './aspect-list';
import { HostNotFound } from './exceptions';

export type ComponentHostSlot = SlotRegistry<ComponentFactory>;

export class ComponentMain {
  constructor(
    /**
     * slot for component hosts to register.
     */
    private hostSlot: ComponentHostSlot,

    /**
     * Express Extension
     */
    private express: ExpressMain
  ) {}

  /**
   * register a new component host.
   */
  registerHost(host: ComponentFactory) {
    this.hostSlot.register(host);
    return this;
  }

  createAspectList(legacyExtensionDataList: ExtensionDataList) {
    return new AspectList(legacyExtensionDataList);
  }

  registerRoute(routes: Route[]) {
    const routeEntries = routes.map((route: Route) => {
      return new ComponentRoute(route, this);
    });

    this.express.register(flatten(routeEntries));
    return this;
  }

  /**
   * set the prior host.
   */
  setHostPriority(id: string) {
    const host = this.hostSlot.get(id);
    if (!host) {
      throw new HostNotFound(id);
    }

    this._priorHost = host;
    return this;
  }

  /**
   * get component host by extension ID.
   */
  getHost(id?: string): ComponentFactory {
    if (id) {
      const host = this.hostSlot.get(id);
      if (!host) throw new HostNotFound(id);
      return host;
    }

    return this.getPriorHost();
  }

  /**
   * get the prior host.
   */
  private getPriorHost() {
    if (this._priorHost) return this._priorHost;

    const hosts = this.hostSlot.values();
    const priorityHost = hosts.find((host) => host.priority);
    return priorityHost || hosts[0];
  }

  private _priorHost: ComponentFactory | undefined;

  static slots = [Slot.withType<ComponentFactory>(), Slot.withType<Route[]>()];

  static runtime = MainRuntime;
  static dependencies = [GraphqlAspect, ExpressAspect];

  static async provider([graphql, express]: [GraphqlMain, ExpressMain], config, [hostSlot]: [ComponentHostSlot]) {
    const componentExtension = new ComponentMain(hostSlot, express);
    graphql.register(componentSchema(componentExtension));

    return componentExtension;
  }
}

ComponentAspect.addRuntime(ComponentMain);
