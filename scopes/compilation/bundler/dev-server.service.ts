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
import { compact, flatten } from 'lodash';
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

export type DevServerServiceOptions = { dedicatedEnvDevServers?: string[] };

/**
 * an env whose dev server could not be created. the other envs are unaffected - only the
 * components of this env (and of the envs deduped into it) are left without a preview.
 */
export type DevServerFailure = {
  /**
   * id of the env that owns the (failed) dev server.
   */
  envId: string;

  /**
   * ids of the envs that were grouped into `envId` and therefore lost their preview with it.
   */
  relatedEnvIds: string[];

  error: Error;
};

export type DevServerRunOnceResult = {
  /**
   * servers that were created successfully.
   */
  servers: ComponentServer[];

  /**
   * envs that failed to produce a server. empty when everything went well.
   */
  failures: DevServerFailure[];
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
  ): Promise<DevServerRunOnceResult> {
    const groupedEnvs = await dedupEnvs(contexts, this.dependencyResolver, dedicatedEnvDevServers);
    const failures: DevServerFailure[] = [];

    // TODO: (gilad) - change this back to promise all once we make the preview pre-bundle to run before that loop
    const servers = await pMapSeries(Object.entries(groupedEnvs), async ([id, contextList]) => {
      // one group failing used to reject the whole batch: groups handled before it had their server
      // thrown away and groups after it were never attempted. keep a failure local to its group.
      return this.createServerForGroup(id, contextList, failures);
    });

    return { servers: compact(servers), failures };
  }

  /**
   * create the dev server that serves a group of deduped envs.
   *
   * building the context bundles the group's preview runtime (`getEntry` -> pre-bundle), and that
   * bundle contains the preview aspect of *every* env in the group - so one env with an import it
   * cannot resolve fails the bundle for all of them. when the bundler names the envs that broke,
   * drop them from the group and build again, so the envs that are fine still get a preview. envs
   * that had to be dropped are recorded in `failures` and end up without a preview server at all.
   */
  private async createServerForGroup(
    groupId: string,
    contextList: ExecutionContext[],
    failures: DevServerFailure[]
  ): Promise<ComponentServer | undefined> {
    // `buildContext` mutates the contexts it gets (it merges the group's components into the main
    // context), so keep the pristine lists around to be able to build again with a subset.
    const pristineComponents = new Map(contextList.map((context) => [context, context.components]));
    let remaining = contextList;

    while (remaining.length) {
      const mainContext = remaining.find((context) => context.envDefinition.id === groupId) || remaining[0];
      const additionalContexts = remaining.filter((context) => context !== mainContext);
      // the group is keyed by the env that owns the dev server, which is not necessarily one of the
      // envs in it (it can be the env they all delegate their dev server to). keep that key unless
      // the env it points at is one of the envs we had to drop.
      const nothingDropped = remaining.length === contextList.length;
      const envId = nothingDropped || mainContext.envDefinition.id === groupId ? groupId : mainContext.envDefinition.id;
      try {
        const devServerContext = await this.buildContext(mainContext, additionalContexts);
        const devServer: DevServer = await devServerContext.envRuntime.env.getDevServer(devServerContext);
        const transformedDevServer: DevServer = this.transformDevServer(devServer, { envId });

        return new ComponentServer(this.pubsub, devServerContext, [3300, 3400], transformedDevServer);
      } catch (error: any) {
        const broken = findFailingContexts(error, remaining);
        // nothing to isolate - either the bundler did not name an env of this group, or every env in
        // it is broken. either way the whole group is out.
        if (!broken.length || broken.length === remaining.length) {
          failures.push({
            envId: mainContext.envDefinition.id,
            relatedEnvIds: additionalContexts.map((context) => context.envDefinition.id),
            error,
          });
          return undefined;
        }
        broken.forEach((context) => {
          failures.push({ envId: context.envDefinition.id, relatedEnvIds: [], error });
        });
        remaining = remaining.filter((context) => !broken.includes(context));
        // the failed attempt left the merged component list on the contexts - undo it, otherwise the
        // next attempt would pull the envs we just dropped back in through the main context.
        pristineComponents.forEach((components, context) => {
          context.components = components;
        });
      }
    }

    return undefined;
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

/**
 * the envs of `contexts` that the bundler blamed for a failure. rspack reports every unresolved
 * module as an `ERROR in <path>` line, and an env's preview aspect is bundled from its capsule -
 * a directory named after the env id with the `/` flattened to `_`.
 */
function findFailingContexts(error: Error, contexts: ExecutionContext[]): ExecutionContext[] {
  const failingModules = (error?.message || '').split('\n').filter((line) => line.startsWith('ERROR in '));
  if (!failingModules.length) return [];
  return contexts.filter((context) => {
    const capsuleDirName = context.envDefinition.id.replace(/\//g, '_');
    return failingModules.some((line) => line.includes(capsuleDirName));
  });
}
