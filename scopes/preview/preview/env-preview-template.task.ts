import {
  BuildContext,
  BuiltTaskResult,
  BuildTask,
  TaskLocation,
  ComponentResult,
  CAPSULE_ARTIFACTS_DIR,
} from '@teambit/builder';
import { MainRuntime } from '@teambit/cli';
import mapSeries from 'p-map-series';
import { Component, ComponentMap } from '@teambit/component';
import { AspectLoaderMain } from '@teambit/aspect-loader';
import { Bundler, BundlerContext, BundlerHtmlConfig, BundlerResult, Target } from '@teambit/bundler';
import type { EnvDefinition, Environment, EnvsMain } from '@teambit/envs';
import { join } from 'path';
import { compact, flatten, isEmpty } from 'lodash';
import { Logger } from '@teambit/logger';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { existsSync, mkdirpSync } from 'fs-extra';
import type { PreviewMain } from './preview.main.runtime';
import { generateTemplateEntries } from './bundler/chunks';
import { generateHtmlConfig } from './bundler/html-plugin';
import { writePeerLink } from './bundler/create-peers-link';

export type ModuleExpose = {
  name: string;
  path: string;
  include?: string[];
};

type TargetsGroup = {
  env: Environment;
  envToGetBundler: Environment;
  targets: Target[];
};
type TargetsGroupMap = {
  [envId: string]: TargetsGroup;
};

export const GENERATE_ENV_TEMPLATE_TASK_NAME = 'GenerateEnvTemplate';

export class EnvPreviewTemplateTask implements BuildTask {
  aspectId = 'teambit.preview/preview';
  name = GENERATE_ENV_TEMPLATE_TASK_NAME;
  location: TaskLocation = 'end';
  // readonly dependencies = [CompilerAspect.id];

  constructor(
    private preview: PreviewMain,
    private envs: EnvsMain,
    private aspectLoader: AspectLoaderMain,
    private dependencyResolver: DependencyResolverMain,
    private logger: Logger
  ) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const previewDefs = this.preview.getDefs();
    const htmlConfig = previewDefs.map((previewModule) => generateHtmlConfig(previewModule, { dev: context.dev }));
    const originalSeedersIds = context.capsuleNetwork.originalSeedersCapsules.map((c) => c.component.id.toString());
    const grouped: TargetsGroupMap = {};
    await Promise.all(
      context.components.map(async (component) => {
        // Do not run over other components in the graph. it make the process much longer with no need
        if (originalSeedersIds && originalSeedersIds.length && !originalSeedersIds.includes(component.id.toString())) {
          return undefined;
        }
        const envDef = this.envs.getEnvFromComponent(component);
        if (!envDef) return undefined;
        const env = envDef.env;
        const bundlingStrategy = this.preview.getBundlingStrategy(envDef.env);
        if (bundlingStrategy.name === 'env') {
          return undefined;
        }
        const target = await this.getEnvTargetFromComponent(context, component, envDef, htmlConfig);
        if (!target) return undefined;
        const shouldUseDefaultBundler = this.shouldUseDefaultBundler(envDef);
        let envToGetBundler = this.envs.getEnvsEnvDefinition().env;
        let groupEnvId = 'default';
        if (!shouldUseDefaultBundler) {
          envToGetBundler = env;
          groupEnvId = envDef.id;
        }
        if (!grouped[groupEnvId]) {
          grouped[groupEnvId] = {
            env,
            envToGetBundler,
            targets: [target],
          };
        } else {
          grouped[groupEnvId].targets.push(target);
        }
        return undefined;
      })
    );
    if (isEmpty(grouped)) {
      return { componentsResults: [] };
    }

    return this.runBundlerForGroups(context, grouped);
  }

  private async runBundlerForGroups(context: BuildContext, groups: TargetsGroupMap): Promise<BuiltTaskResult> {
    const bundlerContext: BundlerContext = Object.assign(context, {
      targets: [],
      entry: [],
      development: context.dev,
      metaData: {
        initiator: `${GENERATE_ENV_TEMPLATE_TASK_NAME} task`,
        envId: context.id,
      },
    });
    const bundlerResults = await mapSeries(Object.entries(groups), async ([, targetsGroup]) => {
      bundlerContext.targets = targetsGroup.targets;
      const bundler: Bundler = await targetsGroup.envToGetBundler.getTemplateBundler(bundlerContext);
      const bundlerResult = await bundler.run();
      return bundlerResult;
    });

    const results = await this.computeResults(bundlerContext, flatten(bundlerResults));
    return results;
  }

  private shouldUseDefaultBundler(envDef: EnvDefinition): boolean {
    if (this.aspectLoader.isCoreEnv(envDef.id) && envDef.id !== 'teambit.react/react-native') return true;
    const env = envDef.env;
    if (env.getTemplateBundler && typeof env.getTemplateBundler === 'function') return false;
    return true;
  }

  private async getEnvTargetFromComponent(
    context: BuildContext,
    envComponent: Component,
    envDef: EnvDefinition,
    htmlConfig: BundlerHtmlConfig[]
  ): Promise<Target | undefined> {
    const env = envDef.env;
    const envPreviewConfig = this.preview.getEnvPreviewConfig(envDef.env);

    const peers = await this.dependencyResolver.getPeerDependenciesListFromEnv(env);
    // const module = await this.getPreviewModule(envComponent);
    // const entries = Object.keys(module).map((key) => module.exposes[key]);
    const capsule = context.capsuleNetwork.graphCapsules.getCapsule(envComponent.id);
    if (!capsule) throw new Error('no capsule found');
    // Passing here the env itself to make sure it's preview runtime will be part of the preview root file
    // that's needed to make sure the providers register there are running correctly
    const previewRoot = await this.preview.writePreviewRuntime(context, [envComponent.id.toString()]);
    const entries = await this.generateEntries({
      envDef,
      splitComponentBundle: envPreviewConfig.splitComponentBundle ?? false,
      workDir: capsule.path,
      peers,
      previewRoot,
    });

    const outputPath = this.computeOutputPath(context, envComponent);
    if (!existsSync(outputPath)) mkdirpSync(outputPath);
    const resolvedEnvAspects = await this.preview.resolveAspects(MainRuntime.name, [envComponent.id], undefined, {
      requestedOnly: true,
    });
    const resolvedEnv = resolvedEnvAspects[0];
    const hostRootDir = resolvedEnv?.aspectPath;

    if (!hostRootDir) {
      this.logger.warn(`env preview template task, hostRootDir is not defined, for env ${envComponent.id.toString()}`);
    }

    return {
      peers,
      html: htmlConfig,
      entries,
      chunking: { splitChunks: true },
      components: [envComponent],
      outputPath,
      /* It's a path to the root of the host component. */
      hostRootDir,
      hostDependencies: peers,
      aliasHostDependencies: true,
    };
  }

  private async generateEntries({
    previewRoot,
    workDir,
    peers,
    envDef,
    splitComponentBundle,
  }: {
    previewRoot: string;
    workDir: string;
    peers: string[];
    envDef: EnvDefinition;
    splitComponentBundle: boolean;
  }) {
    const previewModules = await this.getPreviewModules(envDef);
    const previewEntries = previewModules.map(({ name, path, ...rest }) => {
      const linkFile = this.preview.writeLink(name, ComponentMap.create([]), path, workDir, splitComponentBundle);

      return { name, path, ...rest, entry: linkFile };
    });
    const peerLink = await writePeerLink(peers, workDir);

    const entries = generateTemplateEntries({
      peers: peerLink,
      previewRootPath: previewRoot,
      previewModules: previewEntries,
    });
    return entries;
  }

  async computeResults(context: BundlerContext, results: BundlerResult[]) {
    const allResults = results.map((result) => {
      const componentsResults: ComponentResult[] = result.components.map((component) => {
        return {
          component,
          errors: result.errors.map((err) => (typeof err === 'string' ? err : err.message)),
          warning: result.warnings,
          startTime: result.startTime,
          endTime: result.endTime,
        };
      });
      return componentsResults;
    });

    const componentsResults = flatten(allResults);

    const artifacts = getArtifactDef();

    return {
      componentsResults,
      artifacts,
    };
  }

  private async getPreviewModules(envDef: EnvDefinition): Promise<ModuleExpose[]> {
    const previewDefs = this.preview.getDefs();

    const modules = compact(
      await Promise.all(
        previewDefs.map(async (def) => {
          if (!def.renderTemplatePathByEnv) return undefined;
          return {
            name: def.prefix,
            path: await def.renderTemplatePathByEnv(envDef.env),
            include: def.include,
          };
        })
      )
    );

    return modules;
  }

  private computeOutputPath(context: BuildContext, component: Component) {
    const capsule = context.capsuleNetwork.graphCapsules.getCapsule(component.id);
    if (!capsule) throw new Error('no capsule found');
    return join(capsule.path, getArtifactDirectory());
  }
}

export function getArtifactDirectory() {
  return join(CAPSULE_ARTIFACTS_DIR, 'env-template');
}

export function getArtifactDef() {
  return [
    {
      name: 'env-template',
      globPatterns: ['**'],
      rootDir: getArtifactDirectory(),
    },
  ];
}
