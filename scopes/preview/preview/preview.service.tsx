import { EnvService, ExecutionContext, EnvDefinition, Env, EnvContext, ServiceTransformationMap } from '@teambit/envs';
import { EnvPreviewConfig, PreviewMain } from './preview.main.runtime';
import { BitError } from '@teambit/bit-error';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { Logger } from '@teambit/logger';
import { ComponentBundlingStrategy } from './strategies';
import { Workspace } from '@teambit/workspace';
import { ComponentTargets } from './strategies/component-targets';
import { Bundler, BundlerContext, BundlerHtmlConfig, Target } from '@teambit/bundler';
import { Component } from '@teambit/component';
import { html } from './bundler/html-template';
import { join, resolve } from 'path';
import { generateLinkModulesImport } from './generate-link';
import { existsSync, outputFileSync } from 'fs-extra';

type PreviewTransformationMap = ServiceTransformationMap & {
  /**
   * Returns a paths to a function which mounts a given component to DOM
   * Required for `bit start` & `bit build`
   */
  getMounter?: () => string;

  /**
   * Returns a path to a docs template.
   * Required for `bit start` & `bit build`
   */
  getDocsTemplate?: () => string;

  /**
   * Returns a list of additional host dependencies
   * this list will be provided as globals on the window after bit preview bundle
   * by default bit will merge this list with the peers from the getDependencies function
   */
  getAdditionalHostDependencies?: () => string[] | Promise<string[]>;

  /**
   * Returns preview config like the strategy name to use when bundling the components for the preview
   */
  getPreviewConfig?: () => EnvPreviewConfig;
};

export class PreviewService implements EnvService<any> {
  name = 'preview';

  constructor(
    private preview: PreviewMain,
    private logger: Logger,
    private dependencyResolver: DependencyResolverMain,
    private workspace: Workspace
  ) {}

  transform(env: Env, envContext: EnvContext): PreviewTransformationMap | undefined {
    // Old env
    if (!env?.preview) return undefined;
    const preview = env.preview()(envContext);

    const transformMap: PreviewTransformationMap = {
      getAdditionalHostDependencies: preview.getHostDependencies.bind(preview),
      getMounter: preview.getMounter.bind(preview),
      getDocsTemplate: preview.getDocsTemplate.bind(preview),
      getPreviewConfig: preview.getPreviewConfig.bind(preview),
    };

    if (preview.getTemplateBundler) {
      transformMap.getTemplateBundler = (context) => preview.getTemplateBundler(context)(envContext);
    }

    return transformMap;
  }

  async run(context: ExecutionContext, options: { name: string }): Promise<any> {
    const compTargets = new ComponentTargets(this.preview, this.dependencyResolver);

    const defs = this.preview.getDefs();
    const onlyCompositionDef = defs.filter((def) => def.prefix === 'compositions');
    if (!onlyCompositionDef || onlyCompositionDef.length === 0) {
      throw new BitError('unable to find composition definition');
    }
    const components = context.components;
    const outputPath = this.workspace.scope.legacyScope.tmp.composePath(`preview/${options.name}`);
    console.log('🚀 ~ file: preview.service.tsx:75 ~ PreviewService ~ run ~ outputPath:', outputPath);
    // const previewRuntime = await this.preview.writePreviewEntry(context);
    // console.log('🚀 ~ file: preview.service.tsx:77 ~ PreviewService ~ run ~ previewRuntime:', previewRuntime);
    const linkFiles = await this.preview.updateLinkFiles(onlyCompositionDef, context.components, context);
    const dirPath = join(this.preview.tempFolder, context.id);
    console.log('🚀 ~ file: preview.service.tsx:84 ~ PreviewService ~ run ~ dirPath:', dirPath);
    const previewRootEntry = this.generateLocalPreviewRoot(dirPath);

    const entries = [...linkFiles, previewRootEntry];

    console.log('🚀 ~ file: preview.service.tsx:79 ~ PreviewService ~ run ~ linkFiles:', linkFiles);
    const peers = await this.dependencyResolver.getPreviewHostDependenciesFromEnv(context.envDefinition.env);
    const hostRootDir = context.envRuntime.envAspectDefinition?.aspectPath;
    const targets = this.getTargets({ entries, components, outputPath, peers, hostRootDir });
    const url = `/preview/${context.envRuntime.id}`;
    const htmlConfig = this.generateHtmlConfig(onlyCompositionDef[0]);
    console.log('🚀 ~ file: preview.service.tsx:90 ~ PreviewService ~ run ~ htmlConfig:', htmlConfig);
    const bundlerContext: BundlerContext = Object.assign(context, {
      targets,
      compress: false,
      html: [htmlConfig],
      components,
      entry: [],
      publicPath: '/',
      hostRootDir,
      hostDependencies: peers,
      aliasHostDependencies: true,
      rootPath: url,
      development: true,
      metaData: {
        initiator: `Generate local preview`,
        envId: context.id,
      },
    });

    const bundler: Bundler = await context.env.getBundler(bundlerContext);
    const bundlerResults = await bundler.run();
    console.log('🚀 ~ file: preview.service.tsx:103 ~ PreviewService ~ run ~ bundlerResults:', bundlerResults);

    // const results = bundlingStrategy.computeResults(bundlerContext, bundlerResults, this);
    // // @ts-ignore
    // context.splitComponentBundle = false;
    // const targets = await compTargets.computeTargets(
    //   context,
    //   components,
    //   onlyCompositionDef,
    //   outputPath,
    //   (component) => this.workspace.getComponentPackagePath(component),
    //   {
    //     outputPath,
    //     aliasHostDependencies: true,
    //     externalizeHostDependencies: false,
    //   }
    // );
    // console.log('🚀 ~ file: preview.service.tsx:89 ~ PreviewService ~ run ~ targets.ent:', targets[0].entries);
    // console.log('🚀 ~ file: preview.service.tsx:89 ~ PreviewService ~ run ~ targets:', targets);
    // const moduleMap = await onlyCompositionDef.getModuleMap(components);
    // const envRuntime = await this.envs.createEnvironment(components);
    // this.writeLink(onlyCompositionDef.prefix, withPaths, mainModulesMap, dirPath, isSplitComponentBundle);
    // console.log("🚀 ~ file: preview.main.runtime.ts:309 ~ PreviewMain ~ generateComponentPreview ~ defs:", moduleMap.toArray())
    // this.envs.getEnv
  }

  generateLocalPreviewRoot(dir: string) {
    const contents = `const previewModules = window.__bit_preview_modules;
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const comp = urlParams.get('comp');
const compositions = previewModules.get("compositions");
const mounter = compositions.modulesMap.default;
const componentMap = compositions.componentMap;
const foundComponent = componentMap[comp];
if (!foundComponent) {
  throw new Error('component not found');
}
let compositionName = urlParams.get('name');
if (!compositionName) {
  const allCompositions = Object.keys(foundComponent[0]);
  compositionName = allCompositions[0];
}
const composition = foundComponent[0][compositionName];
if (!composition) {
  throw new Error('composition not found');
}
mounter.default(composition);
    `;
    const previewRootPath = resolve(join(dir, `preview.entry.js`));

    // if (!existsSync(previewRootPath)) {
    outputFileSync(previewRootPath, contents);
    // }
    return previewRootPath;
  }

  generateHtmlConfig(previewDef: PreviewDefinition) {
    // const chunks = compact([
    //   previewDef.includePeers && CHUNK_NAMES.peers,
    //   CHUNK_NAMES.previewRoot,
    //   ...(previewDef.include || []),
    //   previewDef.prefix,
    // ]);

    const config: BundlerHtmlConfig = {
      title: 'Preview',
      templateContent: html('Preview'),
      minify: false,
      // chunks,
      filename: 'index.html',
    };
    return config;
  }

  private getTargets({
    entries,
    components,
    outputPath,
    peers,
    hostRootDir,
  }: {
    entries: string[];
    components: Component[];
    outputPath: string;
    peers?: string[];
    hostRootDir: string;
  }): Target[] {
    return [
      {
        entries,
        components,
        outputPath,
        hostRootDir,
        hostDependencies: peers,
        externalizeHostDependencies: false,
        aliasHostDependencies: true,
      },
    ];
  }
}
