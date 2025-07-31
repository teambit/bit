import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import type { ExpressMain, Route } from '@teambit/express';
import { ExpressAspect } from '@teambit/express';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import type { SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { ComponentID } from '@teambit/component-id';
import { flatten, orderBy } from 'lodash';
import type { LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import type { ExtensionDataList } from '@teambit/legacy.extension-data';
import type { ComponentFactory } from './component-factory';
import { ComponentAspect } from './component.aspect';
import { componentSchema } from './component.graphql';
import type { RegisteredComponentRoute } from './component.route';
import { ComponentRoute } from './component.route';
import { AspectList } from './aspect-list';
import { HostNotFound } from './exceptions';
import type { AspectEntry } from './aspect-entry';
import type { ShowFragment } from './show';
import {
  ShowCmd,
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
  dependencyResolver: DependencyResolverMain;
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

  /**
   * important! avoid using this method.
   * seems like this method was written to work around a very specific case when the ComponentID of the aspects are
   * not available. in case of new components, to get the ComponentID, the workspace-aspect is needed to get the
   * default-scope. when this method is called from the scope, there is no way to get the real component-id.
   * instead, this method asks for the "scope", which when called by the scope-aspect is the current scope-name.
   * it may or may not be the real scope-name of the aspect.
   * to fix this possibly incorrect scope-name, the `workspace.resolveScopeAspectListIds()` checks whether the
   * scope-name is the same as scope.name, and if so, resolve it to the correct scope-name.
   */
  createAspectListFromLegacy(legacyExtensionDataList: ExtensionDataList) {
    return AspectList.fromLegacyExtensions(legacyExtensionDataList);
  }

  createAspectListFromEntries(entries: AspectEntry[]) {
    return new AspectList(entries);
  }

  registerRoute(routes: RegisteredComponentRoute[]) {
    const routeEntries = routes.map((route: RegisteredComponentRoute) => {
      return new ComponentRoute(route, this);
    });

    const flattenRoutes = flatten(routeEntries) as any as Route[];

    this.express.register(flattenRoutes);
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

  getHostIfExist(id?: string): ComponentFactory | undefined {
    try {
      return this.getHost(id);
    } catch (err) {
      if (err instanceof HostNotFound) return undefined;
      throw err;
    }
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
  static dependencies = [GraphqlAspect, ExpressAspect, CLIAspect, LoggerAspect];

  static async provider(
    [graphql, express, cli, loggerMain]: [GraphqlMain, ExpressMain, CLIMain, LoggerMain],
    config,
    [hostSlot, showFragmentSlot]: [ComponentHostSlot, ShowFragmentSlot]
  ) {
    const logger = loggerMain.createLogger(ComponentAspect.id);
    const componentExtension = new ComponentMain(hostSlot, express, showFragmentSlot);
    cli.register(new ShowCmd(componentExtension, logger));

    componentExtension.registerShowFragments([
      new NameFragment(),
      new MainFileFragment(),
      new IDFragment(),
      new ScopeFragment(),
      new FilesFragment(),
      new ExtensionsFragment(),
    ]);
    graphql.register(() => componentSchema(componentExtension));

    return componentExtension;
  }
}

ComponentAspect.addRuntime(ComponentMain);
