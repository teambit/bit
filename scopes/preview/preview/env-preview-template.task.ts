import {
  BuildContext,
  BuiltTaskResult,
  BuildTask,
  TaskLocation,
  ComponentResult,
  CAPSULE_ARTIFACTS_DIR,
} from '@teambit/builder';
import mapSeries from 'p-map-series';
import { Component, ComponentMap } from '@teambit/component';
import { AspectLoaderMain } from '@teambit/aspect-loader';
import { Capsule } from '@teambit/isolator';
import { Bundler, BundlerContext, BundlerEntryMap, BundlerHtmlConfig, BundlerResult, Target } from '@teambit/bundler';
import type { EnvDefinition, Environment, EnvsMain } from '@teambit/envs';
import { join } from 'path';
import { cloneDeep, compact, flatten } from 'lodash';
import { existsSync, mkdirpSync } from 'fs-extra';
import type { PreviewMain } from './preview.main.runtime';
import { PreviewDefinition } from '.';
import { html } from './webpack';

export type ModuleExpose = {
  name: string;
  path: string;
  include?: string[];
};

type TargetsGroup = {
  env: Environment;
  targets: Target[];
};
type TargetsGroupMap = {
  [envId: string]: TargetsGroup;
};

export const GENERATE_ENV_TEMPLATE_TASK_NAME = 'GenerateEnvTemplate';
export const PREVIEW_ROOT_CHUNK_NAME = 'previewRoot';
export const PEERS_CHUNK_NAME = 'peers';

export class EnvPreviewTemplateTask implements BuildTask {
  aspectId = 'teambit.preview/preview';
  name = GENERATE_ENV_TEMPLATE_TASK_NAME;
  location: TaskLocation = 'end';
  // readonly dependencies = [CompilerAspect.id];

  constructor(private preview: PreviewMain, private envs: EnvsMain, private aspectLoader: AspectLoaderMain) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const previewDefs = this.preview.getDefs();
    const htmlConfig = this.generateHtmlConfig(previewDefs, PREVIEW_ROOT_CHUNK_NAME, PEERS_CHUNK_NAME, {
      dev: context.dev,
    });
    const grouped: TargetsGroupMap = {};
    await Promise.all(
      context.components.map(async (component) => {
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
            env: envToGetBundler,
            targets: [target],
          };
        } else {
          grouped[groupEnvId].targets.push(target);
        }
        return undefined;
      })
    );
    return this.runBundlerForGroups(context, grouped);
  }

  private async runBundlerForGroups(context: BuildContext, groups: TargetsGroupMap): Promise<BuiltTaskResult> {
    const bundlerContext: BundlerContext = Object.assign(cloneDeep(context), {
      targets: [],
      entry: [],
      externalizePeer: false,
      development: context.dev,
    });
    const bundlerResults = await mapSeries(Object.entries(groups), async ([, targetsGroup]) => {
      bundlerContext.targets = targetsGroup.targets;
      const bundler: Bundler = await targetsGroup.env.getTemplateBundler(bundlerContext);
      const bundlerResult = await bundler.run();
      return bundlerResult;
    });

    const results = await this.computeResults(bundlerContext, flatten(bundlerResults));
    return results;
  }

  private shouldUseDefaultBundler(envDef: EnvDefinition): boolean {
    if (this.aspectLoader.isCoreEnv(envDef.id)) return true;
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
    const isSplitComponentBundle = envPreviewConfig.splitComponentBundle ?? false;
    const envGetDeps = (await env.getDependencies()) || {};
    const envComponentPeers = Object.keys(envGetDeps.peerDependencies || {}) || [];
    const envHostDeps = env.getHostDependencies() || [];
    const peers = envComponentPeers.concat(envHostDeps);

    // const module = await this.getPreviewModule(envComponent);
    // const entries = Object.keys(module).map((key) => module.exposes[key]);
    const capsule = context.capsuleNetwork.graphCapsules.getCapsule(envComponent.id);
    if (!capsule) throw new Error('no capsule found');
    // Passing here the env itself to make sure it's preview runtime will be part of the preview root file
    // that's needed to make sure the providers register there are running correctly
    const previewRoot = await this.preview.writePreviewRuntime(context, [envComponent.id.toString()]);
    const previewModules = await this.getPreviewModules(envDef);
    // const templatesFile = previewModules.map((template) => {
    //   return this.preview.writeLink(template.name, ComponentMap.create([]), template.path, capsule.path);
    // });
    const outputPath = this.computeOutputPath(context, envComponent);
    if (!existsSync(outputPath)) mkdirpSync(outputPath);
    const entries = this.getEntries(previewModules, capsule, previewRoot, isSplitComponentBundle, peers);

    return {
      peers,
      runtimeChunkName: 'runtime',
      html: htmlConfig,
      entries,
      chunking: {
        splitChunks: true,
      },
      components: [envComponent],
      outputPath,
    };
  }

  private generateHtmlConfig(
    previewDefs: PreviewDefinition[],
    previewRootChunkName: string,
    peersChunkName: string,
    options: { dev?: boolean }
  ): BundlerHtmlConfig[] {
    const htmlConfigs = previewDefs.map((previewModule) =>
      this.generateHtmlConfigForPreviewDef(previewModule, previewRootChunkName, peersChunkName, options)
    );
    return htmlConfigs;
  }

  private generateHtmlConfigForPreviewDef(
    previewDef: PreviewDefinition,
    previewRootChunkName: string,
    peersChunkName: string,
    options: { dev?: boolean }
  ): BundlerHtmlConfig {
    const previewDeps = previewDef.include || [];
    const chunks = [...previewDeps, previewDef.prefix, previewRootChunkName];
    if (previewDef.includePeers) {
      chunks.unshift(peersChunkName);
    }

    const config = {
      title: 'Preview',
      templateContent: html('Preview'),
      minify: options?.dev ?? true,
      chunks,
      filename: `${previewDef.prefix}.html`,
    };
    return config;
  }

  getEntries(
    previewModules: ModuleExpose[],
    capsule: Capsule,
    previewRoot: string,
    isSplitComponentBundle = false,
    peers: string[] = []
  ): BundlerEntryMap {
    const previewRootEntry = {
      filename: 'preview-root.[chunkhash].js',
      import: previewRoot,
    };

    const peersRootEntry = {
      filename: 'peers.[chunkhash].js',
      import: peers,
    };

    const entries = previewModules.reduce(
      (acc, module) => {
        const linkFile = this.preview.writeLink(
          module.name,
          ComponentMap.create([]),
          module.path,
          capsule.path,
          isSplitComponentBundle
        );
        acc[module.name] = {
          // filename: `${module.name}.[contenthash].js`,
          filename: `${module.name}.[chunkhash].js`,
          // filename: `${module.name}.js`,
          import: linkFile,
          // library: {
          //   name: module.name,
          //   type: 'umd',
          // },
        };
        if (module.include) {
          acc[module.name].dependOn = module.include;
        }
        return acc;
      },
      { [PREVIEW_ROOT_CHUNK_NAME]: previewRootEntry, [PEERS_CHUNK_NAME]: peersRootEntry }
    );

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

  async getPreviewModules(envDef: EnvDefinition): Promise<ModuleExpose[]> {
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
