import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ExpressAspect, ExpressMain, Route } from '@teambit/express';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { ConfigAspect, Config } from '@teambit/config';
import { ComponentID } from '@teambit/component-id';
import { flatten, orderBy } from 'lodash';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config';
import { ComponentFactory } from './component-factory';
import { ComponentAspect } from './component.aspect';
import { componentSchema } from './component.graphql';
import { ComponentRoute } from './component.route';
import { AspectList } from './aspect-list';
import { HostNotFound } from './exceptions';
import { AspectEntry } from './aspect-entry';
import {
  ShowCmd,
  ShowFragment,
  NameFragment,
  MainFileFragment,
  IDFragment,
  ScopeFragment,
  FilesFragment,
  ExtensionsFragment,
} from './show';

export type ComponentHostSlot = SlotRegistry<ComponentFactory>;

export type ShowFragmentSlot = SlotRegistry<ShowFragment[]>;

export class ComponentMain {
  constructor(
    /**
     * slot for component hosts to register.
     */
    private hostSlot: ComponentHostSlot,

    /**
     * Express Extension
     */
    private express: ExpressMain,

    private showFragmentSlot: ShowFragmentSlot
  ) {}

  /**
   * register a new component host.
   */
  registerHost(host: ComponentFactory) {
    this.hostSlot.register(host);
    return this;
  }

  createAspectList(legacyExtensionDataList: ExtensionDataList, scope?: string) {
    return AspectList.fromLegacyExtensions(legacyExtensionDataList, scope);
  }

  createAspectListFromEntries(entries: AspectEntry[]) {
    return new AspectList(entries);
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

  getRoute(id: ComponentID, routeName: string) {
    return `/api/${id.toString()}/~aspect/${routeName}`;
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

  getShowFragments() {
    const fragments = orderBy(flatten(this.showFragmentSlot.values()), ['weight', ['asc']]);
    return fragments;
  }

  isHost(name: string) {
    return !!this.hostSlot.get(name);
  }

  /**
   * register a show fragment to display further information in the `bit show` command.
   */
  registerShowFragments(showFragments: ShowFragment[]) {
    this.showFragmentSlot.register(showFragments);
    return this;
  }

  private _priorHost: ComponentFactory | undefined;

  static slots = [Slot.withType<ComponentFactory>(), Slot.withType<Route[]>(), Slot.withType<ShowFragment[]>()];

  static runtime = MainRuntime;
  static dependencies = [GraphqlAspect, ExpressAspect, CLIAspect, ConfigAspect];

  static async provider(
    [graphql, express, cli, configAspect]: [GraphqlMain, ExpressMain, CLIMain, Config],
    config,
    [hostSlot, showFragmentSlot]: [ComponentHostSlot, ShowFragmentSlot]
  ) {
    const componentExtension = new ComponentMain(hostSlot, express, showFragmentSlot);

    if ((configAspect.workspaceConfig && !configAspect.workspaceConfig.isLegacy) || configAspect.type === 'scope') {
      cli.unregister('show');
      cli.register(new ShowCmd(componentExtension));
    }

    componentExtension.registerShowFragments([
      new NameFragment(),
      new MainFileFragment(),
      new IDFragment(),
      new ScopeFragment(),
      new FilesFragment(),
      new ExtensionsFragment(),
    ]);
    graphql.register(componentSchema(componentExtension));

    return componentExtension;
  }
}

ComponentAspect.addRuntime(ComponentMain);
