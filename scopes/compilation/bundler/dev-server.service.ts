import { EnvService, ExecutionContext } from '@teambit/envs';
import { PubsubMain } from '@teambit/pubsub';
import { flatten } from 'lodash';
import { BrowserRuntimeSlot } from './bundler.main.runtime';
import { ComponentServer } from './component-server';
import { DevServer } from './dev-server';
import { DevServerContext } from './dev-server-context';
import { getEntry } from './get-entry';
import { getExposes } from './get-exposes';
import { selectPort } from './select-port';

export type DevServerServiceOptions = { dedicatedEnvDevServers?: string[] };

export class DevServerService implements EnvService<ComponentServer> {
  name = 'dev server';

  constructor(
    /**
     * browser runtime slot
     */
    private pubsub: PubsubMain,

    /**
     * browser runtime slot
     */
    private runtimeSlot: BrowserRuntimeSlot
  ) {}

  // async run(context: ExecutionContext): Promise<ComponentServer[]> {
  //   const devServerContext = await this.buildContext(context);
  //   const devServer: DevServer = context.env.getDevServer(devServerContext);
  //   const port = await selectPort();
  //   // TODO: refactor to replace with a component server instance.
  //   return new ComponentServer(this.pubsub, context, port, devServer);
  // }

  async runOnce(
    contexts: ExecutionContext[],
    { dedicatedEnvDevServers }: DevServerServiceOptions
  ): Promise<ComponentServer[]> {
    const getEnvId = (context, dedicatedServers): string => {
      const contextEnvId = context.id;
      const contextEnvIdWithoutVersion = contextEnvId.split('@')[0];
      if (dedicatedServers.includes(contextEnvIdWithoutVersion)) {
        return contextEnvId;
      }
      return context.env?.getDevEnvId(context);
    };

    // de-duping dev servers by the amount of type the dev server configuration was overridden by envs.
    const byOriginalEnv = contexts.reduce<{ [key: string]: ExecutionContext[] }>((acc, context) => {
      const envId = getEnvId(context, dedicatedEnvDevServers);
      if (acc[envId]) {
        acc[envId].push(context);
        return acc;
      }

      acc[envId] = [context];
      return acc;
    }, {});
    const portRange = [3300, 3400];
    const usedPorts: number[] = [];

    const servers = await Promise.all(
      Object.entries(byOriginalEnv).map(async ([id, contextList]) => {
        let mainContext = contextList.find((context) => context.envDefinition.id === id);
        if (!mainContext) mainContext = contextList[0];
        const additionalContexts = contextList.filter((context) => context.envDefinition.id !== id);
        this.enrichContextWithComponentsAndRelatedContext(mainContext, additionalContexts);
        const envDevServerContext = await this.buildEnvServerContext(mainContext);
        const envDevServer: DevServer = envDevServerContext.envRuntime.env.getDevServer(envDevServerContext);
        const port = await selectPort(portRange, usedPorts);
        usedPorts.push(port);
        envDevServerContext.port = port;

        // TODO: consider change this to a new class called EnvServer
        const componentServer = new ComponentServer(this.pubsub, envDevServerContext, portRange, envDevServer);
        componentServer.port = port;
        return componentServer;
      })
    );

    return servers;
  }

  mergeContext() {}

  private getComponentsFromContexts(contexts: ExecutionContext[]) {
    return flatten(
      contexts.map((context) => {
        return context.components;
      })
    );
  }

  /**
   * builds the execution context for the dev server.
   */
  private enrichContextWithComponentsAndRelatedContext(
    context: ExecutionContext,
    additionalContexts: ExecutionContext[] = []
  ): void {
    context.relatedContexts = additionalContexts.map((ctx) => ctx.envDefinition.id);
    context.components = context.components.concat(this.getComponentsFromContexts(additionalContexts));
  }

  /**
   * builds the execution context for the dev server.
   */
  private async buildEnvServerContext(context: ExecutionContext): Promise<DevServerContext> {
    const entry = await getEntry(context, this.runtimeSlot);
    const exposes = await getExposes(context, this.runtimeSlot);
    return Object.assign(context, {
      entry,
      // don't start with a leading "/" because it generates errors on Windows
      rootPath: `preview/${context.envRuntime.id}`,
      publicPath: `/public`,
      exposes,
    });
  }
}
