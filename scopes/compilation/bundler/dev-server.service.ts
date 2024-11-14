import { EnvService, ExecutionContext, EnvDefinition, Env, EnvContext, ServiceTransformationMap } from '@teambit/envs';
import { PubsubMain } from '@teambit/pubsub';
import chalk from 'chalk';
import { flatten } from 'lodash';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import highlight from 'cli-highlight';
import { sep } from 'path';
import pMapSeries from 'p-map-series';
import { BrowserRuntimeSlot, DevServerTransformerSlot } from './bundler.main.runtime';
import { ComponentServer } from './component-server';
import { dedupEnvs } from './dedup-envs';
import { DevServer } from './dev-server';
import { DevServerContext } from './dev-server-context';
import { getEntry } from './get-entry';

export type DevServerServiceOptions = { dedicatedEnvDevServers?: string[] };

type DevServiceTransformationMap = ServiceTransformationMap & {
  /**
   * Required for `bit start`
   */
  getDevEnvId?: (context?: any) => string;

  /**
   * Returns and configures the dev server
   * Required for `bit start`
   */
  getDevServer?: (context: DevServerContext) => DevServer | Promise<DevServer>;
};

export type DevServerDescriptor = {
  /**
   * id of the dev server (e.g. webpack)
   */
  id: string;

  /**
   * display name of the dev server (e.g. Webpack dev server)
   */
  displayName: string;

  /**
   * icon of the configured dev server.
   */
  icon: string;

  /**
   * string containing the config for display.
   */
  config: string;

  version?: string;
};

export class DevServerService implements EnvService<ComponentServer, DevServerDescriptor> {
  name = 'dev server';

  constructor(
    private pubsub: PubsubMain,

    private dependencyResolver: DependencyResolverMain,

    /**
     * browser runtime slot
     */
    private runtimeSlot: BrowserRuntimeSlot,

    private devServerTransformerSlot: DevServerTransformerSlot
  ) {}

  async render(env: EnvDefinition, context: ExecutionContext[]) {
    const descriptor = await this.getDescriptor(env, context);
    const name = `${chalk.green('configured dev server:')} ${descriptor?.id} (${descriptor?.displayName} @ ${
      descriptor?.version
    })`;
    const configLabel = chalk.green('dev server config:');
    const configObj = descriptor?.config
      ? highlight(descriptor?.config, { language: 'javascript', ignoreIllegals: true })
      : '';
    return `${name}\n${configLabel}\n${configObj}`;
  }

  async getDescriptor(
    environment: EnvDefinition,
    context?: ExecutionContext[]
  ): Promise<DevServerDescriptor | undefined> {
    if (!environment.env.getDevServer || !context) return undefined;
    const mergedContext = await this.buildContext(context[0], []);
    const devServer: DevServer = environment.env.getDevServer(mergedContext);

    return {
      id: devServer.id || '',
      displayName: devServer.displayName || '',
      icon: devServer.icon || '',
      config: devServer.displayConfig ? devServer.displayConfig() : '',
      version: devServer.version ? devServer.version() : '?',
    };
  }

  transform(env: Env, envContext: EnvContext): DevServiceTransformationMap | undefined {
    // Old env
    if (!env?.preview) return undefined;
    const preview = env.preview()(envContext);

    return {
      getDevEnvId: () => {
        return preview.getDevEnvId();
      },
      getDevServer: (context) => {
        return preview.getDevServer(context)(envContext);
      },
    };
  }

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
    const groupedEnvs = await dedupEnvs(contexts, this.dependencyResolver, dedicatedEnvDevServers);

    // TODO: (gilad) - change this back to promise all once we make the preview pre-bundle to run before that loop
    const servers = await pMapSeries(Object.entries(groupedEnvs), async ([id, contextList]) => {
      const mainContext = contextList.find((context) => context.envDefinition.id === id) || contextList[0];
      const additionalContexts = contextList.filter((context) => context.envDefinition.id !== id);

      const devServerContext = await this.buildContext(mainContext, additionalContexts);
      const devServer: DevServer = await devServerContext.envRuntime.env.getDevServer(devServerContext);
      const transformedDevServer: DevServer = this.transformDevServer(devServer, { envId: id });

      return new ComponentServer(this.pubsub, devServerContext, [3300, 3400], transformedDevServer);
    });

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
    const peers = await this.dependencyResolver.getPreviewHostDependenciesFromEnv(context.envDefinition.env);
    const hostRootDir = context.envRuntime.envAspectDefinition?.aspectPath;
    const entry = await getEntry(context, this.runtimeSlot);
    console.log('🚀 ~ file: dev-server.service.ts:166 ~ DevServerService ~ entry:', entry);
    const componentDirectoryMap = {};
    context.components.forEach((component) => {
      // @ts-ignore this is usually a workspace component here so it has a workspace
      const workspace = component.workspace;
      if (!workspace) return;
      componentDirectoryMap[component.id.toString()] = workspace.componentDir(component.id);
    });

    return Object.assign(context, {
      entry,
      componentDirectoryMap,
      // don't start with a leading "/" because it generates errors on Windows
      rootPath: `preview/${context.envRuntime.id}`,
      publicPath: `${sep}public`,
      hostRootDir,
      hostDependencies: peers,
      aliasHostDependencies: true,
    });
  }

  private transformDevServer(devServer: DevServer, { envId }: { envId: string }): DevServer {
    return this.devServerTransformerSlot
      .values()
      .reduce((updatedDevServer, transformFn) => transformFn(updatedDevServer, { envId }), devServer);
  }
}
