import { PubsubAspect, PubsubMain } from '@teambit/pubsub';
import { MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentID } from '@teambit/component';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { BrowserRuntime } from './browser-runtime';
import { BundlerAspect } from './bundler.aspect';
import { ComponentServer } from './component-server';
import { NewDevServerCreatedEvent } from './events';
import { BundlerContext } from './bundler-context';
import { devServerSchema } from './dev-server.graphql';
import { DevServerService } from './dev-server.service';
import { BundlerService } from './bundler.service';
import { DevServer } from './dev-server';
import { Workspace } from '@teambit/workspace';

export type DevServerTransformer = (devServer: DevServer, { envId }: { envId: string }) => DevServer;

export type BrowserRuntimeSlot = SlotRegistry<BrowserRuntime>;
export type DevServerTransformerSlot = SlotRegistry<DevServerTransformer>;

export type BundlerConfig = {
  dedicatedEnvDevServers: string[];
};

/**
 * bundler extension.
 */
export class BundlerMain {
  constructor(
    readonly config: BundlerConfig,
    /**
     * Pubsub extension.
     */
    private pubsub: PubsubMain,

    /**
     * environments extension.
     */
    private envs: EnvsMain,

    /**
     * dev server service.
     */
    private devService: DevServerService,

    /**
     * browser runtime slot.
     */
    private runtimeSlot: BrowserRuntimeSlot,

    /**
     * dev server transformer slot.
     */
    private devServerTransformerSlot: DevServerTransformerSlot
  ) { }

  getServerEnvIds(): string[] {
    if (!this._componentServers) return [];
    return this._componentServers.map(server => server.context.envRuntime.id);
  }

  async createServerForNewEnvironment(
    workspace: Workspace,
    newComponent?: Component
  ): Promise<ComponentServer | undefined> {
    // Early exit if no existing servers
    // @todo - instead of listening to dev servers need to listen whether bit start is running 
    // to handle the case when there are no existing servers but bit start is running
    // if (!this._componentServers?.length) {
    //   console.log("\n\n\n\n\n\n\n\n No existing servers found, nothing to compare with");
    //   return undefined;
    // }

    const existingServers = this._componentServers || [];
    // const existingCompSet = new Set<string>(
    //   existingServers.flatMap(server =>
    //     server.context.components.map(comp => comp.id.toString())
    //   )
    // );
    const existingEnvSet = new Set<string>(
      existingServers.map(server => server.context.envRuntime.id)
    );

    if (newComponent) {
      const bitMapEntry = workspace.bitMap.getBitmapEntry(newComponent.id);
      const compEnvFromBitmap = (bitMapEntry?.config?.['teambit.envs/envs'] as any)?.env;

      console.log("🚀 ~ BundlerMain ~ compEnvFromBitmap:", compEnvFromBitmap)

      const compEnvIdFromBitmap = compEnvFromBitmap && workspace.bitMap.getAspectIdFromConfig(
        newComponent.id,
        ComponentID.fromString(compEnvFromBitmap),
        true
      );

      console.log("🚀 ~ BundlerMain ~ compEnvIdFromBitmap:", compEnvIdFromBitmap)

      const envId = compEnvIdFromBitmap || this.envs.getEnvId(newComponent);

      console.log("🚀 ~ BundlerMain ~ envId:", envId)

      if (!existingEnvSet.has(envId)) {
        console.log(`\n\n\n\n\n\n\n\n Detected new component with new environment: ${envId}`);

        try {
          const newServers = await this.devServer([newComponent], true);

          console.log("🚀 ~ BundlerMain ~ newServers:", newServers)

          if (newServers.length === 0) {
            console.log("\n\n\n\n\n\n\n\n No new server was created for the component");
            return undefined;
          }

          const server = newServers.find(s => s.context.envRuntime.id === envId);

          if (!server) {
            console.log("\n\n\n\n\n\n\n\n Server not found for environment", envId, newServers.map(n => n.context.envRuntime));
            return undefined;
          }

          this.pubsub.pub(
            BundlerAspect.id,
            new NewDevServerCreatedEvent(
              Date.now(),
              server,
              server.context,
              server.hostname,
              server.port,
            )
          );
          console.log(`\n\n\n\n\n\n\n\n Starting server for environment ${envId}`);
          console.log(`\n\n\n\n\n\n\n\n Server started for environment ${envId} at ${server.url}`);
          return server;
        } catch (err) {
          console.log(`\n\n\n\n\n\n\n\n Error creating server for new component environment ${envId}:`, err);
          return undefined;
        }
      }
      return undefined;
    }

    // When no specific component is provided, identify components with new environments

    // const allIds = workspace.listIds();
    // const newCompIds = allIds.filter(id => !existingCompSet.has(id.toString()));

    // console.log("\n\n\n\n🚀 ~ BundlerMain ~ newCompIds:", newCompIds)

    // if (newCompIds.length === 0) {
    //   console.log("\n\n\n\n\n\n\n\n No new components detected");
    //   return undefined;
    // }

    // const compIdsByEnv: Record<string, ComponentID[]> = {};
    // const compIdsNeedingLoading: ComponentID[] = [];

    // for (const compId of newCompIds) {
    //   const bitMapEntry = workspace.bitMap.getBitmapEntry(compId);
    //   const envFromBitmap = (bitMapEntry?.config?.['teambit.envs/envs'] as any)?.env as string | undefined;

    //   console.log("🚀 ~ BundlerMain ~ envFromBitmap:", envFromBitmap)

    //   if (envFromBitmap) {
    //     const envWithVersionFromBitmap = workspace.bitMap.getAspectIdFromConfig(
    //       compId, ComponentID.fromString(envFromBitmap), true)

    //     if (!existingEnvSet.has(envFromBitmap)) {
    //       if (!compIdsByEnv[envFromBitmap]) {
    //         compIdsByEnv[envFromBitmap] = [];
    //       }
    //       compIdsByEnv[envFromBitmap].push(compId);
    //     }
    //   } else {
    //     compIdsNeedingLoading.push(compId);
    //   }
    // }

    // const loadedComponentsMap: Record<string, Component> = {};

    // if (compIdsNeedingLoading.length > 0) {
    //   console.log(`\n\n\n\n\n\n Loading ${compIdsNeedingLoading.length} components to determine their environments`);

    //   const components = await workspace.getMany(compIdsNeedingLoading);

    //   for (const comp of components) {
    //     loadedComponentsMap[comp.id.toString()] = comp;

    //     const envId = this.envs.getEnvId(comp);

    //     if (!existingEnvSet.has(envId)) {
    //       if (!compIdsByEnv[envId]) {
    //         compIdsByEnv[envId] = [];
    //       }
    //       compIdsByEnv[envId].push(comp.id);
    //     }
    //   }
    // }

    // const newEnvIds = Object.keys(compIdsByEnv);

    // if (newEnvIds.length === 0) {
    //   console.log("\n\n\n\n\n\n No new environments detected");
    //   return undefined;
    // }

    // console.log(`\n\n\n\n\n\n Detected ${newEnvIds.length} new environments that need servers`);

    // let newServers: ComponentServer[] = [];
    // try {
    //   for (const envId of newEnvIds) {
    //     const componentIds = compIdsByEnv[envId];

    //     const components: Component[] = [];
    //     const idsToLoad: ComponentID[] = [];

    //     for (const id of componentIds) {
    //       const idStr = id.toString();
    //       if (loadedComponentsMap[idStr]) {
    //         components.push(loadedComponentsMap[idStr]);
    //       } else {
    //         idsToLoad.push(id);
    //       }
    //     }

    //     if (idsToLoad.length > 0) {
    //       console.log(`\n\n\n\n\n\n Loading ${idsToLoad.length} additional components for environment ${envId}`);
    //       const loadedComponents = await workspace.getMany(idsToLoad);
    //       components.push(...loadedComponents);
    //     }

    //     console.log(
    //       `\n\n\n\n\n\n   Creating server for new environment: ${envId} with ${components.length} components: ` +
    //       `${components.map(c => c.id.toString()).join(', ')}`
    //     );

    //     const servers = await this.devServer(components);

    //     if (servers.length > 0) {
    //       newServers = newServers.concat(servers);

    //       await Promise.all(
    //         servers.map(async server => {
    //           try {
    //             console.log(`\n\n\n\n\n\n Starting server for environment ${envId}`);
    //             await server.listen();
    //             this.pubsub.pub(
    //               BundlerAspect.id,
    //               new ComponentsServerStartedEvent(
    //                 Date.now(), 
    //                 server, 
    //                 server.context, 
    //                 server.hostname, 
    //                 server.port
    //               )
    //             );
    //             console.log(`\n\n\n\n\n\n Server started for environment ${envId} at ${server.url}`);
    //           } catch (err) {
    //             console.log(`\n\n\n\n\n\n Failed to start server for environment ${envId}:`, err);
    //           }
    //         })
    //       );
    //     } else {
    //       console.log(`\n\n\n\n\n\n No server created for environment ${envId}`);
    //     }
    //   }
    // } catch (err) {
    //   console.log("\n\n\n\n\n\n Error creating servers for new environments:", err);
    // }

    // return newServers.length > 0 ? newServers[0] : undefined;
  }

  /**
   * load all given components in corresponding dev servers.
   * @param components defaults to all components in the workspace.
   */
  async devServer(components: Component[], append = false): Promise<ComponentServer[]> {
    const envRuntime = await this.envs.createEnvironment(components);
    // TODO: this must be refactored away from here. this logic should be in the Preview.
    // @ts-ignore
    const servers: ComponentServer[] = await envRuntime.runOnce<ComponentServer[]>(this.devService, {
      dedicatedEnvDevServers: this.config.dedicatedEnvDevServers,
    });

    if (!append) {
      this._componentServers = servers;
    }
    else {
      this._componentServers = (this._componentServers || []).concat(servers);
    }

    this.indexByComponent();

    return this._componentServers;
  }

  /**
   * get a dev server instance containing a component.
   * @param component
   */
  getComponentServer(component: Component): undefined | ComponentServer {
    if (!this._componentServers) return undefined;
    const envId = this.envs.getEnvId(component);
    const server = this._componentServers.find(
      (componentServer) =>
        componentServer.context.relatedContexts.includes(envId) || componentServer.context.id === envId
    );
    return server;
  }

  /**
   * compute entry files for bundling components in a given execution context.
  */
  async computeEntries(context: BundlerContext) {
    const slotEntries = await Promise.all(
      this.runtimeSlot.values().map(async (browserRuntime) => browserRuntime.entry(context))
    );

    const slotPaths = slotEntries.reduce((acc, current) => {
      acc = acc.concat(current);
      return acc;
    });

    return slotPaths;
  }

  /**
   * register a new browser runtime environment.
   * @param browserRuntime
   */
  registerTarget(browserRuntime: BrowserRuntime[]) {
    browserRuntime.map((runtime) => {
      return this.runtimeSlot.register(runtime);
    });

    return this;
  }

  /**
   * register a new dev server transformer.
   * @param devServerTransformer
   */
  registerDevServerTransformer(devServerTransformer: DevServerTransformer) {
    this.devServerTransformerSlot.register(devServerTransformer);
    return this;
  }

  /**
   * component servers.
   */
  private _componentServers: null | ComponentServer[];

  private indexByComponent() { }

  static slots = [Slot.withType<BrowserRuntime>(), Slot.withType<DevServerTransformerSlot>()];

  static runtime = MainRuntime;
  static dependencies = [
    PubsubAspect, EnvsAspect, GraphqlAspect, DependencyResolverAspect, ComponentAspect];

  static defaultConfig = {
    dedicatedEnvDevServers: [],
  };

  static async provider(
    [pubsub, envs, graphql, dependencyResolver]:
      [PubsubMain, EnvsMain, GraphqlMain, DependencyResolverMain],
    config,
    [runtimeSlot, devServerTransformerSlot]: [BrowserRuntimeSlot, DevServerTransformerSlot]
  ) {
    const devServerService = new DevServerService(pubsub, dependencyResolver, runtimeSlot, devServerTransformerSlot);
    const bundler = new BundlerMain(config, pubsub, envs, devServerService, runtimeSlot, devServerTransformerSlot);
    envs.registerService(devServerService, new BundlerService());
    
    graphql.register(() => devServerSchema(bundler));

    return bundler;
  }
}

BundlerAspect.addRuntime(BundlerMain);
