/* eslint-disable max-classes-per-file */
import mapSeries from 'p-map-series';
import { Component, ComponentID } from '@teambit/component';
import { EnvsMain } from '@teambit/envs';
import type { PubsubMain } from '@teambit/pubsub';
import { SerializableResults, Workspace } from '@teambit/workspace';
import path from 'path';
import { BitId } from '@teambit/legacy-bit-id';
import loader from '@teambit/legacy/dist/cli/loader';
import { DEFAULT_DIST_DIRNAME } from '@teambit/legacy/dist/constants';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { Dist, SourceFile } from '@teambit/legacy/dist/consumer/component/sources';
import DataToPersist from '@teambit/legacy/dist/consumer/component/sources/data-to-persist';
import { AspectLoaderMain } from '@teambit/aspect-loader';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import logger from '@teambit/legacy/dist/logger/logger';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import RemovePath from '@teambit/legacy/dist/consumer/component/sources/remove-path';
import { UiMain } from '@teambit/ui';
import type { PreStartOpts } from '@teambit/ui';
import { PathOsBasedAbsolute, PathOsBasedRelative } from '@teambit/legacy/dist/utils/path';
import { CompilerAspect } from './compiler.aspect';
import { CompilerErrorEvent, ComponentCompilationOnDoneEvent } from './events';
import { Compiler } from './types';

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
};

export type CompileError = { path: string; error: Error };

export class ComponentCompiler {
  constructor(
    private pubsub: PubsubMain,
    private workspace: Workspace,
    private component: ConsumerComponent,
    private compilerInstance: Compiler,
    private compilerId: string,
    private dists: Dist[] = [],
    private compileErrors: CompileError[] = []
  ) {}

  async compile(noThrow = true, options: CompileOptions): Promise<BuildResult> {
    let dataToPersist;
    // delete dist folder before transpilation (because some compilers (like ngPackagr) can generate files there during the compilation process)
    if (options.deleteDistDir) {
      dataToPersist = new DataToPersist();
      dataToPersist.removePath(new RemovePath(this.distDir));
      dataToPersist.addBasePath(this.workspace.path);
      await dataToPersist.persistAllToFS();
    }

    if (this.compilerInstance.transpileFile) {
      await Promise.all(this.component.files.map((file: SourceFile) => this.compileOneFileWithNewCompiler(file)));
    } else if (this.compilerInstance.transpileComponent) {
      await this.compileAllFilesWithNewCompiler(this.component);
    } else {
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
    if (this.component.compiler) loader.succeed();
    this.pubsub.pub(
      CompilerAspect.id,
      new ComponentCompilationOnDoneEvent(this.compileErrors, this.component, buildResults)
    );
    return { component: this.component.id.toString(), buildResults };
  }

  private throwOnCompileErrors(noThrow = true) {
    if (this.compileErrors.length) {
      this.compileErrors.forEach((errorItem) => {
        logger.error(`compilation error at ${errorItem.path}`, errorItem.error);
      });
      const formatError = (errorItem) => `${errorItem.path}\n${errorItem.error}`;
      const err = new Error(`compilation failed. see the following errors from the compiler
${this.compileErrors.map(formatError).join('\n')}`);

      this.pubsub.pub(CompilerAspect.id, new CompilerErrorEvent(err));

      if (!noThrow) {
        throw err;
      }

      logger.console(err.message);
    }
  }

  private get distDir(): PathOsBasedRelative {
    const packageName = componentIdToPackageName(this.component);
    const packageDir = path.join('node_modules', packageName);
    const distDirName = DEFAULT_DIST_DIRNAME;
    return path.join(packageDir, distDirName);
  }

  private get componentDir(): PathOsBasedAbsolute {
    return this.workspace.componentDir(new ComponentID(this.component.id));
  }

  private async compileOneFileWithNewCompiler(file: SourceFile): Promise<void> {
    const options = { componentDir: this.componentDir, filePath: file.relative };
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
    const base = this.distDir;
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

  private async compileAllFilesWithNewCompiler(component: ConsumerComponent): Promise<void> {
    const base = this.distDir;
    const filesToCompile: SourceFile[] = [];
    component.files.forEach((file: SourceFile) => {
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

    if (filesToCompile.length) {
      try {
        await this.compilerInstance.transpileComponent?.({
          component,
          componentDir: this.componentDir,
          outputDir: this.workspace.getComponentPackagePath(component),
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
    private ui: UiMain
  ) {
    if (this.workspace) {
      this.workspace.registerOnComponentChange(this.onComponentChange.bind(this));
      this.workspace.registerOnComponentAdd(this.onComponentChange.bind(this));
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
    await this.compileComponents([], { changed: true, verbose: false, deleteDistDir: false });
  }

  async onAspectLoadFail(err: Error & { code?: string }, id: ComponentID): Promise<boolean> {
    if (err.code && err.code === 'MODULE_NOT_FOUND' && this.workspace) {
      await this.compileComponents([id.toString()], {}, true);
      return true;
    }
    return false;
  }

  async onComponentChange(component: Component): Promise<SerializableResults> {
    const buildResults = await this.compileComponents([component.id.toString()], {}, true);
    return {
      results: buildResults,
      toString() {
        return `${buildResults[0]?.buildResults?.join('\n\t')}`;
      },
    };
  }

  async compileComponents(
    componentsIds: string[] | BitId[], // when empty, it compiles new+modified (unless options.all is set),
    options: CompileOptions,
    noThrow?: boolean
  ): Promise<BuildResult[]> {
    if (!this.workspace) throw new ConsumerNotFound();
    if (this.workspace.isLegacy) throw new Error('workspace-compiler should work for Harmony workspace only');
    const componentIds = await this.getIdsToCompile(componentsIds, options.changed);
    const components = await this.workspace.getMany(componentIds);

    const componentsAndNewCompilers: ComponentCompiler[] = [];
    components.forEach((c) => {
      const environment = this.envs.getEnv(c).env;
      const compilerInstance = environment.getCompiler?.();
      // if there is no componentDir (e.g. author that added files, not dir), then we can't write the dists
      // inside the component dir.
      if (compilerInstance && c.state._consumer.componentMap?.getComponentDir()) {
        const compilerName = compilerInstance.constructor.name || 'compiler';
        componentsAndNewCompilers.push(
          new ComponentCompiler(this.pubsub, this.workspace, c.state._consumer, compilerInstance, compilerName)
        );
      }
    });
    const newCompilersResultOnWorkspace = await mapSeries(componentsAndNewCompilers, (componentAndNewCompilers) =>
      componentAndNewCompilers.compile(noThrow, options)
    );

    return newCompilersResultOnWorkspace;
  }

  private async getIdsToCompile(componentsIds: Array<string | BitId>, changed = false): Promise<ComponentID[]> {
    if (componentsIds.length) {
      return this.workspace.resolveMultipleComponentIds(componentsIds);
    }
    if (changed) {
      return this.workspace.getNewAndModifiedIds();
    }
    return this.workspace.getAllComponentIds();
  }
}
