/* eslint-disable max-classes-per-file */
import mapSeries from 'p-map-series';
import { Component, ComponentID } from '@teambit/component';
import { EnvsMain } from '@teambit/envs';
import type { PubsubMain } from '@teambit/pubsub';
import { SerializableResults, Workspace, WatchOptions } from '@teambit/workspace';
import path from 'path';
import { BitId } from '@teambit/legacy-bit-id';
import { Logger } from '@teambit/logger';
import loader from '@teambit/legacy/dist/cli/loader';
import { DEFAULT_DIST_DIRNAME } from '@teambit/legacy/dist/constants';
import { AbstractVinyl, Dist } from '@teambit/legacy/dist/consumer/component/sources';
import DataToPersist from '@teambit/legacy/dist/consumer/component/sources/data-to-persist';
import { AspectLoaderMain } from '@teambit/aspect-loader';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import RemovePath from '@teambit/legacy/dist/consumer/component/sources/remove-path';
import { UiMain } from '@teambit/ui';
import type { PreStartOpts } from '@teambit/ui';
import { PathOsBasedAbsolute, PathOsBasedRelative } from '@teambit/legacy/dist/utils/path';
import { MultiCompiler } from '@teambit/multi-compiler';
import { CompilerAspect } from './compiler.aspect';
import { CompilerErrorEvent, ComponentCompilationOnDoneEvent } from './events';
import { Compiler, CompilationInitiator } from './types';

export type BuildResult = { component: string; buildResults: string[] | null | undefined };

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
};

export type CompileError = { path: string; error: Error };

export class ComponentCompiler {
  constructor(
    private pubsub: PubsubMain,
    private workspace: Workspace,
    private component: Component,
    private compilerInstance: Compiler,
    private compilerId: string,
    private logger: Logger,
    private dependencyResolver: DependencyResolverMain,
    private dists: Dist[] = [],
    private compileErrors: CompileError[] = []
  ) {}

  async compile(noThrow = true, options: CompileOptions): Promise<BuildResult> {
    let dataToPersist;
    const deleteDistDir = options.deleteDistDir ?? this.compilerInstance.deleteDistDir;
    // delete dist folder before transpilation (because some compilers (like ngPackagr) can generate files there during the compilation process)
    if (deleteDistDir) {
      dataToPersist = new DataToPersist();
      for (const distDir of await this.distDirs()) {
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
        this.component.filesystem.files.map((file: AbstractVinyl) => this.compileOneFile(file, options.initiator))
      );
    }

    if (canTranspileComponent) {
      await this.compileAllFiles(this.component, options.initiator);
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
    this.pubsub.pub(
      CompilerAspect.id,
      new ComponentCompilationOnDoneEvent(this.compileErrors, this.component, buildResults)
    );
    return { component: this.component.id.toString(), buildResults };
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
    const injectedDirs = await this.getInjectedDirs();
    return [packageDir, ...injectedDirs].map((dist) => path.join(dist, DEFAULT_DIST_DIRNAME));
  }

  private async getInjectedDirs(): Promise<PathOsBasedRelative[]> {
    const relativeCompDir = this.workspace.componentDir(this.component.id, undefined, {
      relative: true,
    });
    return this.dependencyResolver.getInjectedDirs(this.workspace.path, relativeCompDir);
  }

  private get componentDir(): PathOsBasedAbsolute {
    return this.workspace.componentDir(this.component.id);
  }

  private async compileOneFile(file: AbstractVinyl, initiator: CompilationInitiator): Promise<void> {
    const options = { componentDir: this.componentDir, filePath: file.relative, initiator };
    const isFileSupported = this.compilerInstance.isFileSupported(file.path);
    let compileResults;
    if (isFileSupported) {
      try {
        compileResults = this.compilerInstance.transpileFile?.(file.contents.toString(), options);
      } catch (error: any) {
        this.compileErrors.push({ path: file.path, error });
        return;
      }
    }
    for (const base of await this.distDirs()) {
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

  private async compileAllFiles(component: Component, initiator: CompilationInitiator): Promise<void> {
    const filesToCompile: AbstractVinyl[] = [];
    for (const base of await this.distDirs()) {
      component.filesystem.files.forEach((file: AbstractVinyl) => {
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
          component,
          componentDir: this.componentDir,
          outputDir: this.workspace.getComponentPackagePath(component),
          initiator,
        });
      } catch (error: any) {
        this.compileErrors.push({ path: this.componentDir, error });
      }
    }
  }
}

export class WorkspaceCompiler {
  constructor(
    private workspace: Workspace,
    private envs: EnvsMain,
    private pubsub: PubsubMain,
    private aspectLoader: AspectLoaderMain,
    private ui: UiMain,
    private logger: Logger,
    private dependencyResolver: DependencyResolverMain
  ) {
    if (this.workspace) {
      this.workspace.registerOnComponentChange(this.onComponentChange.bind(this));
      this.workspace.registerOnComponentAdd(this.onComponentChange.bind(this));
      this.workspace.registerOnPreWatch(this.onPreWatch.bind(this));
      this.ui.registerPreStart(this.onPreStart.bind(this));
    }
    if (this.aspectLoader) {
      this.aspectLoader.registerOnAspectLoadErrorSlot(this.onAspectLoadFail.bind(this));
    }
  }

  async onPreStart(preStartOpts: PreStartOpts): Promise<void> {
    if (preStartOpts.skipCompilation) {
      return;
    }
    await this.compileComponents([], {
      changed: true,
      verbose: false,
      deleteDistDir: false,
      initiator: CompilationInitiator.PreStart,
    });
  }

  async onAspectLoadFail(err: Error & { code?: string }, id: ComponentID): Promise<boolean> {
    if (err.code && err.code === 'MODULE_NOT_FOUND' && this.workspace) {
      await this.compileComponents([id.toString()], { initiator: CompilationInitiator.AspectLoadFail }, true);
      return true;
    }
    return false;
  }

  async onComponentChange(
    component: Component,
    files: string[],
    initiator?: CompilationInitiator
  ): Promise<SerializableResults> {
    const buildResults = await this.compileComponents(
      [component.id.toString()],
      { initiator: initiator || CompilationInitiator.ComponentChanged },
      true
    );
    return {
      results: buildResults,
      toString() {
        return `${buildResults[0]?.buildResults?.join('\n\t')}`;
      },
    };
  }

  async onPreWatch(components: Component[], watchOpts: WatchOptions) {
    if (watchOpts.preCompile) {
      const start = Date.now();
      this.logger.console(`compiling ${components.length} components`);
      await this.compileComponents(
        components.map((c) => c.id._legacy),
        { initiator: CompilationInitiator.PreWatch }
      );
      const end = Date.now() - start;
      this.logger.consoleSuccess(`compiled ${components.length} components successfully (${end / 1000} sec)`);
    }
  }

  async compileComponents(
    componentsIds: string[] | BitId[] | ComponentID[], // when empty, it compiles new+modified (unless options.all is set),
    options: CompileOptions,
    noThrow?: boolean
  ): Promise<BuildResult[]> {
    if (!this.workspace) throw new ConsumerNotFound();
    if (this.workspace.isLegacy) throw new Error('workspace-compiler should work for Harmony workspace only');
    const componentIds = await this.getIdsToCompile(componentsIds, options.changed);
    const components = await this.workspace.getMany(componentIds);

    const componentsCompilers: ComponentCompiler[] = [];
    components.forEach((c) => {
      const environment = this.envs.getEnv(c).env;
      const compilerInstance = environment.getCompiler?.();
      // if there is no componentDir (e.g. author that added files, not dir), then we can't write the dists
      // inside the component dir.
      if (compilerInstance && c.state._consumer.componentMap?.getComponentDir()) {
        const compilerName = compilerInstance.constructor.name || 'compiler';
        componentsCompilers.push(
          new ComponentCompiler(
            this.pubsub,
            this.workspace,
            c,
            compilerInstance,
            compilerName,
            this.logger,
            this.dependencyResolver
          )
        );
      }
    });
    const resultOnWorkspace = await mapSeries(componentsCompilers, (componentCompiler) =>
      componentCompiler.compile(noThrow, options)
    );

    return resultOnWorkspace;
  }

  private async getIdsToCompile(
    componentsIds: Array<string | ComponentID | BitId>,
    changed = false
  ): Promise<ComponentID[]> {
    if (componentsIds.length) {
      return this.workspace.resolveMultipleComponentIds(componentsIds);
    }
    if (changed) {
      return this.workspace.getNewAndModifiedIds();
    }
    return this.workspace.getAllComponentIds();
  }
}
