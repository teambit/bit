/* eslint-disable max-classes-per-file */
import mapSeries from 'p-map-series';
import { Component } from '@teambit/component';
import { EnvDefinition, EnvsMain } from '@teambit/envs';
import type { PubsubMain } from '@teambit/pubsub';
import { SerializableResults, Workspace, OutsideWorkspaceError } from '@teambit/workspace';
import type { WorkspaceComponentLoadOptions } from '@teambit/workspace';
import { WatcherMain, WatchOptions } from '@teambit/watcher';
import path from 'path';
import chalk from 'chalk';
import { ComponentID } from '@teambit/component-id';
import { Logger } from '@teambit/logger';
import loader from '@teambit/legacy/dist/cli/loader';
import { DEFAULT_DIST_DIRNAME } from '@teambit/legacy/dist/constants';
import { AbstractVinyl, Dist, DataToPersist, RemovePath } from '@teambit/component.sources';
import {
  linkToNodeModulesByComponents,
  removeLinksFromNodeModules,
} from '@teambit/workspace.modules.node-modules-linker';
import { AspectLoaderMain } from '@teambit/aspect-loader';
import { DependencyList, DependencyResolverMain } from '@teambit/dependency-resolver';
import { PathOsBasedAbsolute, PathOsBasedRelative } from '@teambit/toolbox.path.path';
import { componentIdToPackageName } from '@teambit/pkg.modules.component-package-name';
import { UiMain } from '@teambit/ui';
import { readRootComponentsDir } from '@teambit/workspace.root-components';
import { compact, groupBy, uniq } from 'lodash';
import type { PreStartOpts } from '@teambit/ui';
import { MultiCompiler } from '@teambit/multi-compiler';
import { CompilerAspect } from './compiler.aspect';
import { CompilerErrorEvent } from './events';
import { Compiler, CompilationInitiator, TranspileComponentParams, TypeGeneratorCompParams } from './types';

export type BuildResult = {
  component: string;
  buildResults: string[];
  errors: CompileError[];
};

export type CompileOptions = {
  changed?: boolean; // compile only new and modified components
  verbose?: boolean; // show more data, such as, dist paths
  /**
   * whether the dist root dir should be deleted before writing new dists.
   * defaults to true for `bit compile` and false everywhere else, such as `bit watch` and `bit
   * start` to avoid webpack "EINTR" error.
   */
  deleteDistDir?: boolean;
  initiator: CompilationInitiator; // describes where the compilation is coming from
  // should we create links in node_modules for the compiled components (default = true)
  // this will link the source files, and create the package.json
  linkComponents?: boolean;
  /**
   * whether to generate types after the compilation, default = false.
   * keep in mind that it's a heavy operation, and hurts the performance.
   */
  generateTypes?: boolean;
};

export type CompileError = { path: string; error: Error };

export class ComponentCompiler {
  constructor(
    private pubsub: PubsubMain,
    private workspace: Workspace,
    readonly component: Component,
    readonly compilerInstance: Compiler,
    private compilerId: string,
    private logger: Logger,
    readonly env: EnvDefinition,
    private dists: Dist[] = [],
    private compileErrors: CompileError[] = []
  ) {}

  async compile(noThrow = true, options: CompileOptions): Promise<BuildResult> {
    let dataToPersist;
    const deleteDistDir = options.deleteDistDir ?? this.compilerInstance.deleteDistDir;
    const distDirs = await this.distDirs();
    // delete dist folder before transpilation (because some compilers (like ngPackagr) can generate files there during the compilation process)
    if (deleteDistDir) {
      dataToPersist = new DataToPersist();
      for (const distDir of distDirs) {
        dataToPersist.removePath(new RemovePath(distDir));
      }
      dataToPersist.addBasePath(this.workspace.path);
      await dataToPersist.persistAllToFS();
    }

    const compilers: Compiler[] = (this.compilerInstance as MultiCompiler).compilers
      ? (this.compilerInstance as MultiCompiler).compilers
      : [this.compilerInstance];
    const canTranspileFile = compilers.find((c) => c.transpileFile);
    const canTranspileComponent = compilers.find((c) => c.transpileComponent);

    if (canTranspileFile) {
      await Promise.all(
        this.component.filesystem.files.map((file: AbstractVinyl) =>
          this.compileOneFile(file, options.initiator, distDirs)
        )
      );
    }

    if (canTranspileComponent) {
      await this.compileAllFiles(options.initiator, distDirs);
    }

    if (!canTranspileFile && !canTranspileComponent) {
      throw new Error(
        `compiler ${this.compilerId.toString()} doesn't implement either "transpileFile" or "transpileComponent" methods`
      );
    }
    this.throwOnCompileErrors(noThrow);

    // writing the dists with `component.setDists(dists); component.dists.writeDists` is tricky
    // as it uses other base-paths and doesn't respect the new node-modules base path.
    dataToPersist = new DataToPersist();
    dataToPersist.addManyFiles(this.dists);
    dataToPersist.addBasePath(this.workspace.path);
    await dataToPersist.persistAllToFS();
    const buildResults = this.dists.map((distFile) => distFile.path);
    if (this.component.state._consumer.compiler) loader.succeed();

    return { component: this.component.id.toString(), buildResults, errors: this.compileErrors };
  }

  getPackageDir() {
    const packageName = componentIdToPackageName(this.component.state._consumer);
    return path.join('node_modules', packageName);
  }

  private throwOnCompileErrors(noThrow = true) {
    if (this.compileErrors.length) {
      this.compileErrors.forEach((errorItem) => {
        this.logger.error(`compilation error at ${errorItem.path}`, errorItem.error);
      });
      const formatError = (errorItem) => `${errorItem.path}\n${errorItem.error}`;
      const err = new Error(`compilation failed. see the following errors from the compiler
${this.compileErrors.map(formatError).join('\n')}`);

      this.pubsub.pub(CompilerAspect.id, new CompilerErrorEvent(err));

      if (!noThrow) {
        throw err;
      }

      this.logger.console(err.message);
    }
  }

  private async distDirs(): Promise<PathOsBasedRelative[]> {
    const packageName = componentIdToPackageName(this.component.state._consumer);
    const packageDir = path.join('node_modules', packageName);
    const distDirName = this.compilerInstance.getDistDir?.() || DEFAULT_DIST_DIRNAME;
    const injectedDirs = await this.getInjectedDirs(packageName);
    return [packageDir, ...injectedDirs].map((dist) => path.join(dist, distDirName));
  }

  private async getInjectedDirs(packageName: string): Promise<string[]> {
    const injectedDirs = await this.workspace.getInjectedDirs(this.component);
    if (injectedDirs.length > 0) return injectedDirs;

    const rootDirs = await readRootComponentsDir(this.workspace.rootComponentsPath);
    return rootDirs.map((rootDir) => path.relative(this.workspace.path, path.join(rootDir, packageName)));
  }

  private get componentDir(): PathOsBasedAbsolute {
    return this.workspace.componentDir(this.component.id);
  }

  private async compileOneFile(
    file: AbstractVinyl,
    initiator: CompilationInitiator,
    distDirs: PathOsBasedRelative[]
  ): Promise<void> {
    const options = { componentDir: this.componentDir, filePath: file.relative, initiator };
    const isFileSupported = this.compilerInstance.isFileSupported(file.path);
    let compileResults;
    if (isFileSupported) {
      try {
        compileResults = await this.compilerInstance.transpileFile?.(file.contents.toString(), options);
      } catch (error: any) {
        this.compileErrors.push({ path: file.path, error });
        return;
      }
    }
    for (const base of distDirs) {
      if (isFileSupported && compileResults) {
        this.dists.push(
          ...compileResults.map(
            (result) =>
              new Dist({
                base,
                path: path.join(base, result.outputPath),
                contents: Buffer.from(result.outputText),
              })
          )
        );
      } else if (this.compilerInstance.shouldCopyNonSupportedFiles) {
        // compiler doesn't support this file type. copy the file as is to the dist dir.
        this.dists.push(new Dist({ base, path: path.join(base, file.relative), contents: file.contents }));
      }
    }
  }

  private async compileAllFiles(initiator: CompilationInitiator, distDirs: PathOsBasedRelative[]): Promise<void> {
    const filesToCompile: AbstractVinyl[] = [];
    for (const base of distDirs) {
      this.component.filesystem.files.forEach((file: AbstractVinyl) => {
        const isFileSupported = this.compilerInstance.isFileSupported(file.path);
        if (isFileSupported) {
          filesToCompile.push(file);
        } else if (this.compilerInstance.shouldCopyNonSupportedFiles) {
          // compiler doesn't support this file type. copy the file as is to the dist dir.
          this.dists.push(
            new Dist({
              base,
              path: path.join(base, file.relative),
              contents: file.contents,
            })
          );
        }
      });
    }

    if (filesToCompile.length) {
      try {
        await this.compilerInstance.transpileComponent?.({
          component: this.component,
          componentDir: this.componentDir,
          outputDir: await this.workspace.getComponentPackagePath(this.component),
          initiator,
        });
      } catch (error: any) {
        this.compileErrors.push({ path: this.componentDir, error });
      }
    }
  }
}

type TypeGeneratorParamsPerEnv = { envId: string; compParams: TypeGeneratorCompParams[]; typeCompiler: Compiler };

export class WorkspaceCompiler {
  constructor(
    private workspace: Workspace,
    private envs: EnvsMain,
    private pubsub: PubsubMain,
    private aspectLoader: AspectLoaderMain,
    private ui: UiMain,
    private logger: Logger,
    private dependencyResolver: DependencyResolverMain,
    private watcher: WatcherMain
  ) {
    if (this.workspace) {
      this.workspace.registerOnComponentChange(this.onComponentChange.bind(this));
      this.workspace.registerOnComponentAdd(this.onComponentAdd.bind(this));
      this.watcher.registerOnPreWatch(this.onPreWatch.bind(this));
    }
    this.ui.registerPreStart(this.onPreStart.bind(this));
    if (this.aspectLoader) {
      this.aspectLoader.registerOnAspectLoadErrorSlot(this.onAspectLoadFail.bind(this));
    }
  }

  async onPreStart(preStartOpts: PreStartOpts): Promise<void> {
    if (this.workspace) {
      if (preStartOpts.skipCompilation) {
        return;
      }
      await this.compileComponents([], {
        changed: true,
        verbose: false,
        deleteDistDir: false,
        initiator: CompilationInitiator.PreStart,
      });
    } else {
      await this.watcher.watchScopeInternalFiles();
    }
  }

  async onAspectLoadFail(err: Error & { code?: string }, component: Component): Promise<boolean> {
    const id = component.id;
    const deps = this.dependencyResolver.getDependencies(component);
    const depsIds = deps.getComponentDependencies().map((dep) => {
      return dep.id.toString();
    });
    if (
      ((err.code && (err.code === 'MODULE_NOT_FOUND' || err.code === 'ERR_REQUIRE_ESM')) ||
        err.message.includes('import.meta')) &&
      this.workspace
    ) {
      await this.compileComponents(
        [id.toString(), ...depsIds],
        { initiator: CompilationInitiator.AspectLoadFail },
        true
      );
      return true;
    }
    return false;
  }

  async onComponentAdd(component: Component, files: string[], watchOpts: WatchOptions) {
    return this.onComponentChange(component, files, undefined, watchOpts);
  }

  async onComponentChange(
    component: Component,
    files: string[],
    removedFiles: string[] = [],
    watchOpts: WatchOptions
  ): Promise<SerializableResults | void> {
    if (!watchOpts.compile) return undefined;
    // when files are removed, we need to remove the dist directories and the old symlinks, otherwise, it has
    // symlinks to non-exist files and the dist has stale files
    const deleteDistDir = Boolean(removedFiles?.length);
    if (removedFiles?.length) {
      await removeLinksFromNodeModules(component, this.workspace, removedFiles);
    }
    const buildResults = await this.compileComponents(
      [component.id.toString()],
      { initiator: watchOpts.initiator || CompilationInitiator.ComponentChanged, deleteDistDir },
      true
    );
    return {
      results: buildResults,
      toString() {
        return formatCompileResults(buildResults, watchOpts.verbose);
      },
    };
  }

  async onPreWatch(componentIds: ComponentID[], watchOpts: WatchOptions) {
    if (watchOpts.preCompile) {
      const start = Date.now();
      this.logger.console(`compiling ${componentIds.length} components`);
      await this.compileComponents(
        componentIds.map((id) => id),
        { initiator: CompilationInitiator.PreWatch }
      );
      const end = Date.now() - start;
      this.logger.consoleSuccess(`compiled ${componentIds.length} components successfully (${end / 1000} sec)`);
    }
  }

  async compileComponents(
    componentsIds: string[] | ComponentID[] | ComponentID[], // when empty, it compiles new+modified (unless options.all is set),
    options: CompileOptions,
    noThrow?: boolean,
    componentLoadOptions: WorkspaceComponentLoadOptions = {}
  ): Promise<BuildResult[]> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const componentIds = await this.getIdsToCompile(componentsIds, options.changed);
    // In case the aspect failed to load, we want to compile it without try to re-load it again
    if (options.initiator === CompilationInitiator.AspectLoadFail) {
      componentLoadOptions.loadSeedersAsAspects = false;
    }
    const components = await this.workspace.getMany(componentIds, componentLoadOptions);
    const grouped = await this.buildGroupsToCompile(components);

    const results = await mapSeries(grouped, async (group) => {
      return this.runCompileComponents(group.components, options, noThrow);
    });
    const linkComponents = options.linkComponents ?? true;
    if (linkComponents) {
      await linkToNodeModulesByComponents(components, this.workspace);
    }
    return results.flat();
  }

  private async runCompileComponents(
    components: Component[],
    options: CompileOptions,
    noThrow?: boolean
  ): Promise<BuildResult[]> {
    const componentsCompilers: ComponentCompiler[] = [];

    components.forEach((c) => {
      const env = this.envs.getEnv(c);
      const environment = env.env;
      const compilerInstance = environment.getCompiler?.();

      if (compilerInstance) {
        const compilerName = compilerInstance.constructor.name || 'compiler';
        componentsCompilers.push(
          new ComponentCompiler(this.pubsub, this.workspace, c, compilerInstance, compilerName, this.logger, env)
        );
      } else {
        this.logger.warn(`unable to find a compiler instance for ${c.id.toString()}`);
      }
    });

    const typeGeneratorParamsPerEnv = options.generateTypes
      ? await this.getTypesCompilerPerEnv(componentsCompilers)
      : undefined;

    if (typeGeneratorParamsPerEnv) {
      await this.preGenerateTypesOnWorkspace(typeGeneratorParamsPerEnv);
    }

    const resultOnWorkspace = await mapSeries(componentsCompilers, (componentCompiler) =>
      componentCompiler.compile(noThrow, options)
    );

    if (typeGeneratorParamsPerEnv) {
      await this.generateTypesOnWorkspace(typeGeneratorParamsPerEnv);
    }

    return resultOnWorkspace;
  }

  private async getTypesCompilerPerEnv(componentsCompilers: ComponentCompiler[]): Promise<TypeGeneratorParamsPerEnv[]> {
    const envsMap: { [envId: string]: ComponentCompiler[] } = {};
    componentsCompilers.forEach((componentCompiler) => {
      const envId = componentCompiler.env.id;
      if (!envsMap[envId]) envsMap[envId] = [];
      envsMap[envId].push(componentCompiler);
    });

    const results = await mapSeries(Object.keys(envsMap), async (envId) => {
      const componentCompilers = envsMap[envId];
      const compParams = await Promise.all(
        componentCompilers.map(async (componentCompiler) => {
          return {
            component: componentCompiler.component,
            packageDir: path.join(this.workspace.path, componentCompiler.getPackageDir()),
          };
        })
      );

      let typeCompiler = componentCompilers[0].compilerInstance;
      if (!typeCompiler.preGenerateTypesOnWorkspace) {
        const buildPipe = componentCompilers[0].env.env.getBuildPipe();
        const compilerTasks = buildPipe.filter((task) => task.aspectId === CompilerAspect.id);
        const tsTask = compilerTasks.find(
          (task) => task.compilerInstance && task.compilerInstance.displayName === 'TypeScript'
        );
        if (!tsTask) return;
        typeCompiler = tsTask.compilerInstance;
        if (!typeCompiler.preGenerateTypesOnWorkspace) return;
      }
      return { envId, compParams, typeCompiler };
    });
    return compact(results);
  }

  private async preGenerateTypesOnWorkspace(typesGeneratorParamsPerEnv: TypeGeneratorParamsPerEnv[]) {
    await mapSeries(typesGeneratorParamsPerEnv, async ({ envId, compParams, typeCompiler }) => {
      await typeCompiler.preGenerateTypesOnWorkspace!(compParams, envId);
    });
  }

  private async generateTypesOnWorkspace(typesGeneratorParamsPerEnv: TypeGeneratorParamsPerEnv[]) {
    await mapSeries(typesGeneratorParamsPerEnv, async ({ compParams, typeCompiler }) => {
      await typeCompiler.generateTypesOnWorkspace!(path.join(this.workspace.path, 'node_modules'), compParams);
    });
  }

  /**
   * This function groups the components to compile into groups by their environment and dependencies.
   * The order of the groups is important, the first group should be compiled first.
   * The order inside the group is not important.
   * The groups are:
   * 1. dependencies of envs of envs.
   * 2. envs of envs.
   * 3. dependencies of envs.
   * 4. envs.
   * 5. the rest.
   * @param ids
   */
  async buildGroupsToCompile(components: Component[]): Promise<
    Array<{
      components: Component[];
      envsOfEnvs?: boolean;
      envs?: boolean;
      depsOfEnvsOfEnvs?: boolean;
      depsOfEnvs?: boolean;
      other?: boolean;
    }>
  > {
    const envCompIds = await Promise.all(
      components
        // .map((component) => this.envs.getEnvId(component))
        .map(async (component) => {
          const envId = await this.envs.calculateEnvId(component);
          return envId.toString();
        })
    );
    const envsIds = uniq(envCompIds);
    const groupedByIsEnv = groupBy(components, (component) => {
      if (envsIds.includes(component.id.toString())) return 'envs';
      if (this.envs.isEnv(component)) return 'envs';
      return 'other';
    });
    const envsOfEnvsCompIds = await Promise.all(
      (groupedByIsEnv.envs || [])
        // .map((component) => this.envs.getEnvId(component))
        .map(async (component) => (await this.envs.calculateEnvId(component)).toString())
    );
    const groupedByEnvsOfEnvs = groupBy(groupedByIsEnv.envs, (component) => {
      if (envsOfEnvsCompIds.includes(component.id.toString())) return 'envsOfEnvs';
      return 'otherEnvs';
    });
    const depsOfEnvsOfEnvsCompLists = (groupedByEnvsOfEnvs.envsOfEnvs || []).map((envComp) =>
      this.dependencyResolver.getDependencies(envComp)
    );
    const depsOfEnvsOfEnvsCompIds = DependencyList.merge(depsOfEnvsOfEnvsCompLists)
      .getComponentDependencies()
      .map((dep) => dep.id.toString());
    const groupedByIsDepsOfEnvsOfEnvs = groupBy(groupedByIsEnv.other, (component) => {
      if (depsOfEnvsOfEnvsCompIds.includes(component.id.toString())) return 'depsOfEnvsOfEnvs';
      return 'other';
    });
    const depsOfEnvsCompLists = (groupedByEnvsOfEnvs.otherEnvs || []).map((envComp) =>
      this.dependencyResolver.getDependencies(envComp)
    );
    const depsOfEnvsOfCompIds = DependencyList.merge(depsOfEnvsCompLists)
      .getComponentDependencies()
      .map((dep) => dep.id.toString());
    const groupedByIsDepsOfEnvs = groupBy(groupedByIsDepsOfEnvsOfEnvs.other, (component) => {
      if (depsOfEnvsOfCompIds.includes(component.id.toString())) return 'depsOfEnvs';
      return 'other';
    });
    return [
      {
        components: groupedByIsDepsOfEnvsOfEnvs.depsOfEnvsOfEnvs || [],
        depsOfEnvsOfEnvs: true,
      },
      {
        components: groupedByEnvsOfEnvs.envsOfEnvs || [],
        envsOfEnvs: true,
      },
      {
        components: groupedByIsDepsOfEnvs.depsOfEnvs || [],
        depsOfEnvs: true,
      },
      {
        components: groupedByEnvsOfEnvs.otherEnvs || [],
        envs: true,
      },
      {
        components: groupedByIsDepsOfEnvs.other || [],
        other: true,
      },
    ];
  }

  private async getIdsToCompile(componentsIds: Array<string | ComponentID>, changed = false): Promise<ComponentID[]> {
    if (componentsIds.length) {
      const componentIds = await this.workspace.resolveMultipleComponentIds(componentsIds);
      return this.workspace.filterIds(componentIds);
    }
    if (changed) {
      return this.workspace.getNewAndModifiedIds();
    }
    return this.workspace.listIds();
  }
}

function formatCompileResults(buildResults: BuildResult[], verbose?: boolean) {
  if (!buildResults.length) return '';
  // this gets called when a file is changed, so the buildResults array always has only one item
  const buildResult = buildResults[0];
  const title = ` ${chalk.underline('STATUS\tCOMPONENT ID')}`;
  const verboseComponentFilesArrayToString = () => {
    return buildResult.buildResults.map((filePath) => ` \t - ${filePath}`).join('\n');
  };

  return `${title}
  ${Logger.successSymbol()}SUCCESS\t${buildResult.component}\n
  ${verbose ? `${verboseComponentFilesArrayToString()}\n` : ''}`;
}
