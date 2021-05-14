import { EnvService, ExecutionContext } from '@teambit/envs';
import { PubsubMain } from '@teambit/pubsub';
import { flatten } from 'lodash';
import { BrowserRuntimeSlot } from './bundler.main.runtime';
import { ComponentServer } from './component-server';
import { DevServer } from './dev-server';
import { DevServerContext } from './dev-server-context';
import { getEntry } from './get-entry';
import { selectPort } from './select-port';

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

  async runOnce(contexts: ExecutionContext[]): Promise<ComponentServer[]> {
    // de-duping dev servers by the amount of type the dev server configuration was overridden by envs.
    const byOriginalEnv = contexts.reduce<{ [key: string]: ExecutionContext[] }>((acc, context) => {
      const envId = context.env?.getDevEnvId(context);
      if (acc[envId]) {
        acc[envId].push(context);
        return acc;
      }

      acc[envId] = [context];
      return acc;
    }, {});

    const servers = await Promise.all(
      Object.entries(byOriginalEnv).map(async ([id, contextList]) => {
        let mainContext = contextList.find((context) => context.envDefinition.id === id);
        if (!mainContext) mainContext = contextList[0];
        const additionalContexts = contextList.filter((context) => context.envDefinition.id !== id);
        const devServerContext = await this.buildContext(mainContext, additionalContexts);
        const devServer: DevServer = devServerContext.envRuntime.env.getDevServer(devServerContext);
        const port = await selectPort();

        return new ComponentServer(this.pubsub, devServerContext, port, devServer);
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
  private async buildContext(
    context: ExecutionContext,
    additionalContexts: ExecutionContext[] = []
  ): Promise<DevServerContext> {
    context.relatedContexts = additionalContexts.map((ctx) => ctx.envDefinition.id);
    context.components = context.components.concat(this.getComponentsFromContexts(additionalContexts));

    return Object.assign(context, {
      entry: await getEntry(context, this.runtimeSlot),
      rootPath: `/preview/${context.envRuntime.id}`,
      publicPath: `/public`,
    });
  }
}
