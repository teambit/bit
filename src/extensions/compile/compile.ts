import { Harmony } from '@teambit/harmony';
import path from 'path';
import pMapSeries from 'p-map-series';
import { Workspace } from '../workspace';
import ConsumerComponent from '../../consumer/component';
import { BitId } from '../../bit-id';
import { ResolvedComponent } from '../workspace/resolved-component';
import buildComponent from '../../consumer/component-ops/build-component';
import { Component } from '../component';
import { Capsule } from '../isolator';
import DataToPersist from '../../consumer/component/sources/data-to-persist';
import { Scope } from '../scope';
import { Flows, IdsAndFlows, TASK_SEPARATOR } from '../flows';
import logger from '../../logger/logger';
import loader from '../../cli/loader';
import { Dist } from '../../consumer/component/sources';
import GeneralError from '../../error/general-error';
import { packageNameToComponentId } from '../../utils/bit/package-name-to-component-id';
import { ExtensionDataList } from '../../consumer/config/extension-data';

type BuildResult = { component: string; buildResults: string[] | null | undefined };

export type ComponentAndCapsule = {
  consumerComponent: ConsumerComponent;
  component: Component;
  capsule: Capsule;
};

type buildHookResult = { id: BitId; dists?: Array<{ path: string; content: string }> };

type CompilerInstance = {
  defineCompiler: () => { taskFile: string };
  watchMultiple?: (capsulePaths: string[]) => any;
};

type AggregatedWatcher = {
  compilerId: BitId;
  compilerInstance: CompilerInstance;
  componentIds: BitId[];
  capsulePaths: string[];
};

export class Compile {
  constructor(private workspace: Workspace, private flows: Flows, private scope: Scope, private harmony: Harmony) {
    // @todo: why the scope is undefined here?
    const func = this.compileDuringBuild.bind(this);
    if (this.scope?.onBuild) this.scope.onBuild.push(func);
  }

  async compileDuringBuild(
    ids: BitId[],
    noCache?: boolean,
    verbose?: boolean,
    dontPrintEnvMsg?: boolean
  ): Promise<BuildResult[]> {
    return this.compile(
      ids.map(id => id.toString()),
      noCache,
      verbose,
      dontPrintEnvMsg
    );
  }

  async compile(
    componentsIds: string[] | BitId[], // when empty, it compiles all
    noCache?: boolean,
    verbose?: boolean,
    dontPrintEnvMsg?: boolean
  ): Promise<BuildResult[]> {
    const componentsAndCapsules = await getComponentsAndCapsules(componentsIds, this.workspace);
    logger.debug(`compilerExt, completed created of capsules for ${componentsIds.join(', ')}`);
    const idsAndFlows = new IdsAndFlows();
    const componentsWithLegacyCompilers: ComponentAndCapsule[] = [];
    componentsAndCapsules.forEach(c => {
      const compileCore = c.component.config.extensions.findCoreExtension('compile');
      const compileComponent = c.component.config.extensions.findExtension('compile');
      const compileComponentExported = c.component.config.extensions.findExtension('bit.core/compile', true);
      const compileExtension = compileCore || compileComponent || compileComponentExported;
      const compileConfig = compileExtension?.config;
      const taskName = this.getTaskNameFromCompiler(compileConfig, c.component.config.extensions);
      const value = taskName ? [taskName] : [];
      if (compileConfig) {
        idsAndFlows.push({ id: c.consumerComponent.id, value });
      } else {
        componentsWithLegacyCompilers.push(c);
      }
    });
    let newCompilersResult: BuildResult[] = [];
    let oldCompilersResult: BuildResult[] = [];
    if (idsAndFlows.length) {
      newCompilersResult = await this.compileWithNewCompilers(
        idsAndFlows,
        componentsAndCapsules.map(c => c.consumerComponent)
      );
    }
    if (componentsWithLegacyCompilers.length) {
      oldCompilersResult = await this.compileWithLegacyCompilers(
        componentsWithLegacyCompilers,
        noCache,
        verbose,
        dontPrintEnvMsg
      );
    }

    return [...newCompilersResult, ...oldCompilersResult];
  }

  private getCompilerInstance(compiler: string, extensions: ExtensionDataList): CompilerInstance {
    const compilerBitId = this.getCompilerBitId(compiler, extensions);
    const compilerExtension = this.harmony.get<CompilerInstance>(compilerBitId.toString());
    if (!compilerExtension) {
      throw new Error(`failed to get "${compiler}" extension from Harmony.
the following extensions are available: ${this.harmony.extensionsIds.join(', ')}`);
    }

    return compilerExtension;
  }

  private getTaskNameFromCompiler(compileConfig, extensions: ExtensionDataList): string | null {
    if (!compileConfig || !compileConfig.compiler) return null;
    const compiler = compileConfig.compiler as string;
    const compilerInstance = this.getCompilerInstance(compiler, extensions);
    const defineCompiler = compilerInstance.defineCompiler;
    if (!defineCompiler || typeof defineCompiler !== 'function') {
      throw new GeneralError(`the compiler "${compiler}" instance doesn't have "defineCompiler" function`);
    }
    const compilerDefinition = defineCompiler();
    const taskFile = compilerDefinition.taskFile;
    if (!taskFile) {
      throw new GeneralError(`the "defineCompiler" function of "${compiler}" doesn't return taskFile definition`);
    }
    return compiler + TASK_SEPARATOR + taskFile;
  }

  /**
   * @todo: fix!
   * in the config, the specific-compiler is entered into "compiler" field as a package-name.
   * e.g. @bit/core.typescript.
   * this function finds the full BitId of this compiler, including the version.
   * the full id is needed in order to get the instance from harmony.
   *
   * currently, it's an ugly workaround. the bindingPrefix is hard-coded as @bit.
   * the reason of not fixing it now is that soon will be a better way to get this data.
   */
  private getCompilerBitId(compiler: string, extensions: ExtensionDataList): BitId {
    const compilerBitId = packageNameToComponentId(this.workspace.consumer, compiler, '@bit');
    const compilerExtensionConfig = extensions.findExtension(compilerBitId.toString(), true);
    if (!compilerExtensionConfig) throw new Error(`the compiler ${compilerBitId.toString()} was not loaded`);
    if (!compilerExtensionConfig.extensionId)
      throw new Error(`the compiler ${compilerBitId.toString()} has no extension id`);
    return compilerExtensionConfig.extensionId;
  }

  async compileWithNewCompilers(idsAndFlows: IdsAndFlows, components: ConsumerComponent[]): Promise<BuildResult[]> {
    const reportResults: any = await this.flows.runMultiple(idsAndFlows, { traverse: 'only' });
    // @todo fix once flows.run() get types
    const resultsP: any = Object.values(reportResults.value).map(async (reportResult: any) => {
      const result = reportResult.result.value.tasks;
      const id: BitId = reportResult.result.id;
      if (!result.length) return { id };
      const firstResult = result[0]; // for compile it's always one result because there is only one task to run
      // @todo: currently the error is not passed into runMultiple method. once it's there, show the acutal error.
      if (firstResult.code !== 0) throw new Error(`failed compiling ${id.toString()}`);
      if (!firstResult.value) return { id };
      const distDir = firstResult.value.dir;
      if (!distDir) {
        throw new Error(
          `compile extension failed on ${id.toString()}, it expects to get "dir" as a result of executing the compilers`
        );
      }
      const capsule: Capsule = reportResult.result.value.capsule;
      const distFiles = await getFilesFromCapsuleRecursive(capsule, distDir, path.join(capsule.wrkDir, distDir));
      const distFilesObjects = distFiles.map(distFilePath => {
        const distPath = path.join(distDir, distFilePath);
        return {
          path: distFilePath,
          content: capsule.fs.readFileSync(distPath).toString()
        };
      });
      return { id, dists: distFilesObjects };
    });
    const extensionsResults: buildHookResult[] = await Promise.all(resultsP);
    // @ts-ignore
    return components
      .map(component => {
        const resultFromCompiler = extensionsResults.find(r => component.id.isEqualWithoutVersion(r.id));
        if (!resultFromCompiler || !resultFromCompiler.dists) return null;
        const builtFiles = resultFromCompiler.dists;
        builtFiles.forEach(file => {
          if (!file.path || !file.content || typeof file.content !== 'string') {
            throw new GeneralError(
              'compile interface expects to get files in a form of { path: string, content: string }'
            );
          }
        });
        // @todo: once tag is working, check if anything is missing here. currently the path is a
        // relative path with "dist", but can be easily changed from the compile extension
        const distsFiles = builtFiles.map(file => {
          return new Dist({
            path: file.path,
            contents: Buffer.from(file.content)
          });
        });
        component.setDists(distsFiles);
        return { component: component.id.toString(), buildResults: builtFiles.map(b => b.path) };
      })
      .filter(x => x);
  }

  async compileWithLegacyCompilers(
    componentsAndCapsules: ComponentAndCapsule[],
    noCache?: boolean,
    verbose?: boolean,
    dontPrintEnvMsg?: boolean
  ): Promise<BuildResult[]> {
    // @todo: uncomment this part once we're ready to let legacy-compilers write the dists on the capsule

    // const build = async (componentAndCapsules: ComponentAndCapsule) => {
    //   const component = componentAndCapsules.consumerComponent;
    //   if (component.compiler) loader.start(`building component - ${component.id}`);
    //   await component.build({
    //     scope: this.workspace.consumer.scope,
    //     consumer: this.workspace.consumer
    //   });
    //   if (component.dists.isEmpty() || !component.dists.writeDistsFiles) {
    //     return { component: component.id.toString(), buildResults: null };
    //   }
    //   const dataToPersist = new DataToPersist();
    //   const filesToAdd = component.dists.get().map(file => {
    //     file.updatePaths({ newBase: 'dist' });
    //     return file;
    //   });
    //   dataToPersist.addManyFiles(filesToAdd);
    //   await dataToPersist.persistAllToCapsule(componentAndCapsules.capsule);
    //   const buildResults = component.dists.get().map(d => d.path);
    //   if (component.compiler) loader.succeed();
    //   return { component: component.id.toString(), buildResults };
    // };
    // const buildResults = await pMapSeries(componentsAndCapsules, build);

    const components = componentsAndCapsules.map(c => c.consumerComponent);
    logger.debugAndAddBreadCrumb('scope.buildMultiple', 'using the legacy build mechanism');
    const build = async (component: ConsumerComponent) => {
      if (component.compiler) loader.start(`building component - ${component.id}`);
      //
      await component.build({
        scope: this.workspace.consumer.scope,
        consumer: this.workspace.consumer,
        noCache,
        verbose,
        dontPrintEnvMsg
      });
      const buildResults = await component.dists.writeDists(component, this.workspace.consumer, false);
      if (component.compiler) loader.succeed();
      return { component: component.id.toString(), buildResults };
    };
    const writeLinks = async (component: ConsumerComponent) =>
      component.dists.writeDistsLinks(component, this.workspace.consumer);

    const buildResults = await pMapSeries(components, build);
    await pMapSeries(components, writeLinks);

    return buildResults;
  }

  async legacyCompile(componentsIds: string[], params: { verbose: boolean; noCache: boolean }) {
    const populateDistTask = this.populateComponentDist.bind(this, params);
    const writeDistTask = this.writeComponentDist.bind(this);
    await pipeRunTask(componentsIds, populateDistTask, this.workspace);
    return pipeRunTask(componentsIds, writeDistTask, this.workspace);
  }

  populateComponentDist(params: { verbose: boolean; noCache: boolean }, component: ComponentAndCapsule) {
    return buildComponent({
      component: component.consumerComponent,
      scope: this.workspace.consumer.scope,
      consumer: this.workspace.consumer,
      verbose: params.verbose,
      noCache: params.noCache
    });
  }

  async writeComponentDist(componentAndCapsule: ComponentAndCapsule) {
    const dataToPersist = new DataToPersist();
    const distsFiles = componentAndCapsule.consumerComponent.dists.get();
    distsFiles.map(d => d.updatePaths({ newBase: 'dist' }));
    dataToPersist.addManyFiles(distsFiles);
    await dataToPersist.persistAllToCapsule(componentAndCapsule.capsule);
    return distsFiles.map(d => d.path);
  }

  public async aggregateWatchersByCompiler(): Promise<AggregatedWatcher[]> {
    const componentsAndCapsules = await getComponentsAndCapsules([], this.workspace);
    logger.debug(`compilerExt.getWatchProcesses, completed created of capsules`);
    const watchers: AggregatedWatcher[] = [];
    componentsAndCapsules.forEach(c => {
      const extensions = c.component.config.extensions;
      const compileCore = extensions.findCoreExtension('compile');
      const compileComponent = extensions.findExtension('compile');
      const compileComponentExported = extensions.findExtension('bit.core/compile', true);
      const compileExtension = compileCore || compileComponent || compileComponentExported;
      const compileConfig = compileExtension?.config;
      if (!compileConfig || !compileConfig.compiler) return;

      const compilerInstance = this.getCompilerInstance(compileConfig.compiler as string, extensions);
      if (!compilerInstance.watchMultiple) return; // the component doesn't support it, ignore.
      const compilerId = this.getCompilerBitId(compileConfig.compiler as string, extensions);
      const existingWatcher = watchers.find(w => w.compilerId.isEqual(compilerId));
      if (existingWatcher) {
        existingWatcher.componentIds.push(c.consumerComponent.id);
        existingWatcher.capsulePaths.push(c.capsule.wrkDir);
      } else {
        watchers.push({
          compilerId,
          compilerInstance,
          componentIds: [c.consumerComponent.id],
          capsulePaths: [c.capsule.wrkDir]
        });
      }
    });
    return watchers;
  }
}

function getBitIds(componentsIds: Array<string | BitId>, workspace: Workspace): BitId[] {
  if (componentsIds.length) {
    return componentsIds.map(compId => (compId instanceof BitId ? compId : workspace.consumer.getParsedId(compId)));
  }
  return workspace.consumer.bitMap.getAuthoredAndImportedBitIds();
}

async function getResolvedComponents(
  componentsIds: string[] | BitId[],
  workspace: Workspace
): Promise<ResolvedComponent[]> {
  const bitIds = getBitIds(componentsIds, workspace);
  return workspace.load(bitIds.map(id => id.toString()));
}

async function getComponentsAndCapsules(
  componentsIds: string[] | BitId[],
  workspace: Workspace
): Promise<ComponentAndCapsule[]> {
  const resolvedComponents = await getResolvedComponents(componentsIds, workspace);
  return Promise.all(
    resolvedComponents.map(async (resolvedComponent: ResolvedComponent) => {
      // @todo: it says id._legacy "do not use this", do I have a better option to get the id?
      const consumerComponent = await workspace.consumer.loadComponent(resolvedComponent.component.id._legacy);
      return {
        consumerComponent,
        component: resolvedComponent.component,
        capsule: resolvedComponent.capsule
      };
    })
  );
}

async function pipeRunTask(ids: string[], task: Function, workspace: Workspace) {
  const components = await getComponentsAndCapsules(ids, workspace);
  const results = await Promise.all(components.map(component => task(component)));
  return { results, components };
}

// @todo: refactor. was taken partly from stackOverflow.
// it uses the absolute path because for some reason `capsule.fs.promises.readdir` doesn't work
// the same as `capsule.fs.readdir` and it doesn't have the capsule dir as pwd.
async function getFilesFromCapsuleRecursive(capsule: Capsule, distDir: string, dir: string) {
  const subDirs = await capsule.fs.promises.readdir(dir);
  const files = await Promise.all(
    subDirs.map(async subDir => {
      const res = path.resolve(dir, subDir);
      return (await capsule.fs.promises.stat(res)).isDirectory()
        ? getFilesFromCapsuleRecursive(capsule, distDir, res)
        : path.relative(path.join(capsule.wrkDir, distDir), res);
    })
  );
  return files.reduce((a, f) => a.concat(f), []);
}
