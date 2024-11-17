import filenamify from 'filenamify';
import { EnvService, ExecutionContext, Env, EnvContext, ServiceTransformationMap } from '@teambit/envs';
import { EnvPreviewConfig, PreviewMain } from './preview.main.runtime';
import { BitError } from '@teambit/bit-error';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { Logger } from '@teambit/logger';
import { Workspace } from '@teambit/workspace';
import { Bundler, BundlerContext, BundlerHtmlConfig, Target } from '@teambit/bundler';
import { Component, ComponentID } from '@teambit/component';
import { html } from './bundler/html-template';
import { join, resolve } from 'path';
import { existsSync, outputFileSync, pathExists, readJsonSync } from 'fs-extra';

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

const LOCAL_PREVIEW_DIR = 'local-preview';

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
    const defs = this.preview.getDefs();
    const onlyCompositionDef = defs.filter((def) => def.prefix === 'compositions');
    if (!onlyCompositionDef || onlyCompositionDef.length === 0) {
      throw new BitError('unable to find composition definition');
    }
    const components = context.components;
    const componentIds = components.map((c) => c.id);
    const envDirName = this.getEnvDirName(context.id);
    const outputPath = this.getEnvLocalPreviewDir(options.name, envDirName);
    const linkFiles = await this.preview.updateLinkFiles(onlyCompositionDef, context.components, context);
    const dirPath = join(this.preview.tempFolder, context.id);
    const mappingFile = await this.addComponentsToLocalMapping(options.name, envDirName, componentIds);
    const previewRootEntry = this.generateLocalPreviewRoot(dirPath);

    const entries = [...linkFiles, previewRootEntry];
    const peers = await this.dependencyResolver.getPreviewHostDependenciesFromEnv(context.envDefinition.env);
    const hostRootDir = context.envRuntime.envAspectDefinition?.aspectPath;
    const targets = this.getTargets({ entries, components, outputPath, peers, hostRootDir });
    const url = `/preview/${context.envRuntime.id}`;
    const htmlConfig = this.generateHtmlConfig();
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
    await bundler.run();
    const res = componentIds.reduce((acc, id) => {
      return { ...acc, [id.fullName]: outputPath };
    }, {});
    return res;
  }

  getEnvDirName(envId: string): string {
    return filenamify(envId, { replacement: '_' });
  }

  getLocalPreviewDir(name: string) {
    const dirPath = this.workspace.scope.legacyScope.tmp.composePath(`${LOCAL_PREVIEW_DIR}/${name}`);
    return dirPath;
  }

  getEnvLocalPreviewDir(name: string, envDirName: string) {
    const localPreviewDir = this.getLocalPreviewDir(name);
    return join(localPreviewDir, envDirName);
  }

  getComponentsPreviewPath(name: string) {
    const dirPath = this.getLocalPreviewDir(name);
    const filePath = join(dirPath, 'components-preview.json');
    return filePath;
  }

  async readComponentsPreview(name: string) {
    const filePath = this.getComponentsPreviewPath(name);
    return readJsonSync(filePath);
  }

  async addComponentsToLocalMapping(name: string, envDirPath: string, compIds: ComponentID[]) {
    const filePath = this.getComponentsPreviewPath(name);
    // const idsString = compIds.map((id) => id.toString());
    const idsString = compIds.map((id) => id.fullName);
    const exists = await pathExists(filePath);
    // let newFile = { [envDirPath]: idsString };
    let newFile = idsString.reduce((acc, id) => {
      return { ...acc, [id]: envDirPath };
    }, {});
    if (exists) {
      const existingFile = readJsonSync(filePath);
      newFile = { ...existingFile, ...newFile };
    }
    outputFileSync(filePath, JSON.stringify(newFile, null, 2));
    return newFile;
  }

  generateLocalPreviewRoot(dir: string) {
    const contents = `const previewModules = window.__bit_preview_modules;
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const location = window.location.pathname;
const splitLocation = location.split('/').filter((x) => x);
// Remove message part
splitLocation.shift();
// const comp = urlParams.get('comp');
const comp = splitLocation.join('/');
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
let func = mounter.default;
if (typeof func !== 'function') {
  func = func.default;
}
func(composition);
    `;
    const previewRootPath = resolve(join(dir, `preview.entry.js`));

    // if (!existsSync(previewRootPath)) {
    outputFileSync(previewRootPath, contents);
    // }
    return previewRootPath;
  }

  generateHtmlConfig() {
    const config: BundlerHtmlConfig = {
      title: 'Preview',
      templateContent: html('Preview'),
      minify: false,
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
