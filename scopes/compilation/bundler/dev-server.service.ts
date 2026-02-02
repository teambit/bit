import type {
  EnvService,
  ExecutionContext,
  EnvDefinition,
  Env,
  EnvContext,
  ServiceTransformationMap,
} from '@teambit/envs';
import type { PubsubMain } from '@teambit/pubsub';
import chalk from 'chalk';
import { flatten } from 'lodash';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import highlight from 'cli-highlight';
import { sep } from 'path';
import pMapSeries from 'p-map-series';
import type { BrowserRuntimeSlot, DevServerTransformerSlot } from './bundler.main.runtime';
import { ComponentServer } from './component-server';
import { dedupEnvs } from './dedup-envs';
import type { DevServer } from './dev-server';
import type { DevServerContext } from './dev-server-context';
import { getEntry } from './get-entry';
import { createSharedDepsBundle, collectHostDependencies, SharedDepsBundleResult } from './shared-deps-bundler';

export type DevServerServiceOptions = {
  dedicatedEnvDevServers?: string[];
  /**
   * Enable parallel dev server creation for faster startup.
   * When true, uses Promise.all instead of sequential pMapSeries.
   * Only enable for `bit start` command to avoid side effects in other flows.
   */
  parallelDevServers?: boolean;
  /**
   * PERFORMANCE: Enable shared externalized dependency bundling.
   * Creates a shared bundle of common dependencies using esbuild
   * so webpack can externalize them for faster compilation.
   * NOTE: This is different from Bit's "pre-bundling" of Bit aspects.
   */
  sharedDepsBundle?: boolean;
  /**
   * Workspace root directory for shared deps bundling
   */
  workspaceDir?: string;
};

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

  /** Cached shared deps bundle result to share across all dev servers */
  private sharedDepsResult: SharedDepsBundleResult | null = null;

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

  async runOnce(contexts: ExecutionContext[], options?: DevServerServiceOptions): Promise<ComponentServer[]> {
    const { dedicatedEnvDevServers, parallelDevServers, sharedDepsBundle, workspaceDir } = options || {};
    console.log('[dev-server.service] runOnce options:', {
      parallelDevServers,
      sharedDepsBundle,
      workspaceDir: !!workspaceDir,
    });
    const groupedEnvs = await dedupEnvs(contexts, this.dependencyResolver, dedicatedEnvDevServers);

    // PERFORMANCE: Create shared externalized bundle of host dependencies before creating dev servers
    // This matches the PRODUCTION pattern (create-peers-link.ts, env-preview-template.task.ts):
    // - Use hostDependencies from environments (getPreviewHostDependenciesFromEnv)
    // - These are curated by environment developers, guaranteed browser-safe
    // - Expose them on window using the same naming convention as production
    // - Configure webpack externals to reference them
    if (sharedDepsBundle && workspaceDir && !this.sharedDepsResult) {
      try {
        // Collect host dependencies - curated by environment developers, guaranteed browser-safe
        const hostDeps = await collectHostDependencies(contexts, this.dependencyResolver);
        console.log('[dev-server.service] host deps:', hostDeps);

        // Create shared bundle - matches production pattern (create-peers-link.ts)
        const outputDir = require('path').join(workspaceDir, 'node_modules', '.cache', 'bit-shared-deps');
        this.sharedDepsResult = await createSharedDepsBundle({
          rootDir: workspaceDir,
          packages: hostDeps,
          outputDir,
          useCache: true,
        });
        console.log(
          '[dev-server.service] sharedDepsResult:',
          this.sharedDepsResult?.depsCount,
          'deps bundled in',
          this.sharedDepsResult?.timeTaken,
          'ms'
        );
      } catch (error) {
        // Shared deps bundling failed, continue without it
        console.error('[dev-server.service] shared deps bundling failed:', error);
        this.sharedDepsResult = null;
      }
    }

    const createServer = async ([id, contextList]: [string, ExecutionContext[]]) => {
      const mainContext = contextList.find((context) => context.envDefinition.id === id) || contextList[0];
      const additionalContexts = contextList.filter((context) => context.envDefinition.id !== id);

      const devServerContext = await this.buildContext(mainContext, additionalContexts);
      const devServer: DevServer = await devServerContext.envRuntime.env.getDevServer(devServerContext);
      const transformedDevServer: DevServer = this.transformDevServer(devServer, { envId: id });
      const server = new ComponentServer(this.pubsub, devServerContext, [3300, 3400], transformedDevServer);

      return server;
    };

    // PERFORMANCE: Use Promise.all for parallel dev server creation when enabled
    // The original pMapSeries was added in commit 962c26131 due to "preview pre-bundle timing issues"
    // parallelDevServers flag enables parallel mode only for `bit start` to avoid side effects
    // Impact: With N environments, startup time is O(1) instead of O(N) for server creation
    const servers = parallelDevServers
      ? await Promise.all(Object.entries(groupedEnvs).map(createServer))
      : await pMapSeries(Object.entries(groupedEnvs), createServer);

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
    const componentDirectoryMap = {};
    context.components.forEach((component) => {
      // @ts-ignore this is usually a workspace component here so it has a workspace
      const workspace = component.workspace;
      if (!workspace) return;
      componentDirectoryMap[component.id.toString()] = workspace.componentDir(component.id);
    });

    // Build shared deps info if available (for webpack externalization)
    const sharedDeps = this.sharedDepsResult?.bundlePath
      ? {
          bundlePath: this.sharedDepsResult.bundlePath,
          publicPath: this.sharedDepsResult.publicPath,
          externalsMap: this.sharedDepsResult.externalsMap,
        }
      : undefined;

    return Object.assign(context, {
      entry,
      componentDirectoryMap,
      // don't start with a leading "/" because it generates errors on Windows
      rootPath: `preview/${context.envRuntime.id}`,
      publicPath: `${sep}public`,
      hostRootDir,
      hostDependencies: peers,
      aliasHostDependencies: true,
      sharedDeps,
    });
  }

  private transformDevServer(devServer: DevServer, { envId }: { envId: string }): DevServer {
    return this.devServerTransformerSlot
      .values()
      .reduce((updatedDevServer, transformFn) => transformFn(updatedDevServer, { envId }), devServer);
  }
}
