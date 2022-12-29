import { PluginDefinition } from '@teambit/aspect-loader';
import { Aspect, Harmony } from '@teambit/harmony';
import { ComponentID } from '@teambit/component';
import { WorkerMain } from '@teambit/worker';
import { MainRuntime } from '@teambit/cli';
import { LoggerMain } from '@teambit/logger';
import { flatten } from 'lodash';
import { ServiceHandlerContext as EnvContext } from './services/service-handler-context';
import { Env } from './env-interface';
import { EnvsRegistry, ServicesRegistry } from './environments.main.runtime';

export class EnvPlugin implements PluginDefinition {
  constructor(
    private envSlot: EnvsRegistry,
    private servicesRegistry: ServicesRegistry,
    private loggerMain: LoggerMain,
    private workerMain: WorkerMain,
    private harmony: Harmony
  ) {}

  pattern = '*.bit-env.*';

  runtimes = [MainRuntime.name];

  private createContext(envId: ComponentID) {
    return new EnvContext(envId, this.loggerMain, this.workerMain, this.harmony);
  }

  private transformToLegacyEnv(envId: string, env: Env) {
    const envComponentId = ComponentID.fromString(envId);
    const envContext = this.createContext(envComponentId);
    const allServices = flatten(this.servicesRegistry.values());
    const transformers = allServices.reduce((acc, service) => {
      if (!service.transform) return acc;
      const currTransformer = service.transform(env, envContext);
      if (!currTransformer) return acc;
      return {...acc, ...currTransformer};
    }, {})

    if (!env.preview && !env.compiler) return undefined;
    const preview = env.preview()(envContext);
    const packageGenerator = env.package()(envContext);

    return {
      ...transformers,
      getCompiler: () => env.compiler()(envContext),
      getTester: () => env.tester()(envContext),
      getPackageJsonProps: () => packageGenerator.packageJsonProps,
      getNpmIgnore: () => packageGenerator.npmIgnore,
      name: env.name,
      icon: env.icon,
      getDevEnvId: () => {
        return preview.getDevEnvId();
      },
      getSchemaExtractor: env.schemaExtractor()(envContext),
      getDevServer: (context) => {
        return preview.getDevServer(context)(envContext);
      },
      getAdditionalHostDependencies: preview.getHostDependencies.bind(preview),
      getMounter: preview.getMounter.bind(preview),
      getGeneratorTemplates: () => {
        if (!env.generators) return undefined;
        const generatorList = env.generators()(envContext);
        return generatorList.compute();
      },
      getGeneratorStarters: () => {
        if (!env.starters) return undefined;
        const starterList = env.starters()(envContext);
        return starterList.compute();
      },
      getBuildPipe: () => {
        // TODO: refactor after defining for an env property
        const pipeline = env.build()(envContext);
        if (!pipeline || !pipeline.compute) return [];
        return pipeline?.compute();
      },
      getTagPipe: () => {
        // TODO: refactor after defining for an env property
        const pipeline = env.snap()(envContext);
        if (!pipeline || !pipeline.compute) return [];
        return pipeline?.compute();
      },
      getSnapPipe: () => {
        const pipeline = env.tag()(envContext);
        if (!pipeline || !pipeline.compute) return [];
        return pipeline?.compute();
      },
      getDocsTemplate: preview.getDocsTemplate.bind(preview),
      getPreviewConfig: preview.getPreviewConfig.bind(preview),
      getBundler: (context) => preview.getBundler(context)(envContext),
      __getDescriptor: async () => {
        return {
          type: env.name,
        }
      },
      id: envId,
    }
  }

  register(object: any, aspect: Aspect) {
    const env = this.transformToLegacyEnv(aspect.id, object);
    if (!env) return undefined;
    return this.envSlot.register(env);
  }
}
