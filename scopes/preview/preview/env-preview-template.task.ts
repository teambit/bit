import {
  BuildContext,
  BuiltTaskResult,
  BuildTask,
  TaskLocation,
  ComponentResult,
  CAPSULE_ARTIFACTS_DIR,
} from '@teambit/builder';
import { Component, ComponentMap } from '@teambit/component';
import { Capsule } from '@teambit/isolator';
import { Bundler, BundlerContext, BundlerEntryMap, BundlerHtmlConfig, BundlerResult, Target } from '@teambit/bundler';
import type { EnvsMain } from '@teambit/envs';
import { join } from 'path';
import { compact } from 'lodash';
import { existsSync, mkdirpSync } from 'fs-extra';
import type { PreviewMain } from './preview.main.runtime';
import { PreviewDefinition } from '.';
import { html } from './webpack';

export type ModuleExpose = {
  name: string;
  path: string;
  include?: string[];
};

export const GENERATE_ENV_TEMPLATE_TASK_NAME = 'GenerateEnvTemplate';
export const PREVIEW_ROOT_CHUNK_NAME = 'previewRoot';
export const PEERS_CHUNK_NAME = 'peers';

export class EnvPreviewTemplateTask implements BuildTask {
  aspectId = 'teambit.preview/preview';
  name = GENERATE_ENV_TEMPLATE_TASK_NAME;
  location: TaskLocation = 'end';
  // readonly dependencies = [CompilerAspect.id];

  constructor(private preview: PreviewMain, private envs: EnvsMain) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const previewDefs = this.preview.getDefs();
    const htmlConfig = this.generateHtmlConfig(previewDefs, PREVIEW_ROOT_CHUNK_NAME, PEERS_CHUNK_NAME, {
      dev: context.dev,
    });
    const targets: Target[] = compact(
      await Promise.all(
        context.components.map(async (component) => {
          const envDef = this.envs.getEnvFromComponent(component);
          if (!envDef) return undefined;
          const env = envDef.env;
          const bundlingStrategy = this.preview.getBundlingStrategy(envDef.env);
          if (bundlingStrategy.name === 'env') {
            return undefined;
          }
          const envComponent = component;
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
          const previewModules = await this.getPreviewModules(envComponent);
          // const templatesFile = previewModules.map((template) => {
          //   return this.preview.writeLink(template.name, ComponentMap.create([]), template.path, capsule.path);
          // });
          const outputPath = this.computeOutputPath(context, envComponent);
          if (!existsSync(outputPath)) mkdirpSync(outputPath);
          const entries = this.getEntries(previewModules, capsule, previewRoot, isSplitComponentBundle, peers);

          // const entries = this.getEntries(
          //   previewModules.concat({
          //     name: 'main',
          //     path: previewRoot,
          //   })
          // );

          return {
            // entries: templatesFile.concat(previewRoot),
            peers,
            runtimeChunkName: 'runtime',
            html: htmlConfig,
            entries,
            chunking: {
              splitChunks: true,
            },
            components: [envComponent],
            outputPath,
            // modules: [module],
          };
        })
      )
    );

    if (!targets.length) return { componentsResults: [] };
    const bundlerContext: BundlerContext = Object.assign({}, context, {
      targets,
      entry: [],
      externalizePeer: false,
      development: context.dev,
    });

    const bundler: Bundler = await context.env.getBundler(bundlerContext);
    const bundlerResults = await bundler.run();
    const results = await this.computeResults(bundlerContext, bundlerResults);
    return results;
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

    // const mergedEntries = return entriesArr.reduce((entriesMap, entry) => {
    //   entriesMap[entry.library.name] = entry;
    //   return entriesMap;
    // }, {previewRoot: previewRootEntry});
  }

  async computeResults(context: BundlerContext, results: BundlerResult[]) {
    const result = results[0];

    const componentsResults: ComponentResult[] = result.components.map((component) => {
      return {
        component,
        errors: result.errors.map((err) => (typeof err === 'string' ? err : err.message)),
        warning: result.warnings,
        startTime: result.startTime,
        endTime: result.endTime,
      };
    });

    const artifacts = getArtifactDef();

    return {
      componentsResults,
      artifacts,
    };
  }

  async getPreviewModules(envComponent: Component): Promise<ModuleExpose[]> {
    const env = this.envs.getEnv(envComponent);
    const previewDefs = this.preview.getDefs();
    const modules = compact(
      await Promise.all(
        previewDefs.map(async (def) => {
          if (!def.renderTemplatePathByEnv) return undefined;
          return {
            name: def.prefix,
            path: await def.renderTemplatePathByEnv(env.env),
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

  // private async getPreviewModule(envComponent: Component): Promise<ModuleTarget> {
  //   const env = this.envs.getEnv(envComponent);
  //   const previewDefs = this.preview.getDefs();
  //   const modules = compact(await Promise.all(previewDefs.map(async (def) => {
  //     if (!def.renderTemplatePathByEnv) return undefined;
  //     return [def.prefix, await def.renderTemplatePathByEnv(env.env)];
  //   })));

  //   const exposes = modules.reduce((exposesAcc, [prefix, path]) => {
  //     const internalPath = `./${prefix}`;
  //     exposesAcc[internalPath] = path;
  //     return exposesAcc;
  //   }, {});

  //   return {
  //     component: envComponent,
  //     exposes
  //   };
  // }
}

export function getArtifactDirectory() {
  return join(CAPSULE_ARTIFACTS_DIR, 'env-template');
}

export function getArtifactDef() {
  return [
    {
      name: 'env-template',
      // globPatterns: [`${getArtifactDirectory()}/**`],
      globPatterns: ['**'],
      rootDir: getArtifactDirectory(),
      // context: env,
    },
  ];
}
