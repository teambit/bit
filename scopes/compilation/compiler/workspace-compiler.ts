/* eslint-disable max-classes-per-file */
import { Component, ComponentID } from '@teambit/component';
import { EnvsMain } from '@teambit/envs';
import type { PubsubMain } from '@teambit/pubsub';
import { SerializableResults, Workspace } from '@teambit/workspace';

import BluebirdPromise from 'bluebird';
import path from 'path';

import { BitId } from 'bit-bin/dist/bit-id';
import loader from 'bit-bin/dist/cli/loader';
import { DEFAULT_DIST_DIRNAME } from 'bit-bin/dist/constants';
import ConsumerComponent from 'bit-bin/dist/consumer/component';
import { Dist, SourceFile } from 'bit-bin/dist/consumer/component/sources';
import DataToPersist from 'bit-bin/dist/consumer/component/sources/data-to-persist';
import { ConsumerNotFound } from 'bit-bin/dist/consumer/exceptions';
import logger from 'bit-bin/dist/logger/logger';
import componentIdToPackageName from 'bit-bin/dist/utils/bit/component-id-to-package-name';
import { PathOsBasedAbsolute, PathOsBasedRelative } from 'bit-bin/dist/utils/path';
import { CompilerAspect } from './compiler.aspect';
import { CompilerErrorEvent, ComponentCompilationOnDoneEvent } from './events';

import { Compiler } from './types';

export type BuildResult = { component: string; buildResults: string[] | null | undefined };

export type CompileOptions = {
  changed?: boolean;
  verbose?: boolean;
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

  async compile(noThrow = true): Promise<BuildResult> {
    if (!this.compilerInstance.transpileFile) {
      throw new Error(`compiler ${this.compilerId.toString()} doesn't implement "transpileFile" interface`);
    }
    await Promise.all(this.component.files.map((file) => this.compileOneFileWithNewCompiler(file)));
    this.throwOnCompileErrors(noThrow);

    // writing the dists with `component.setDists(dists); component.dists.writeDists` is tricky
    // as it uses other base-paths and doesn't respect the new node-modules base path.
    const dataToPersist = new DataToPersist();
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

  private async compileOneFileWithNewCompiler(file: SourceFile) {
    const options = { componentDir: this.componentDir, filePath: file.relative };
    const isFileSupported = this.compilerInstance.isFileSupported(file.path);
    let compileResults;
    if (isFileSupported) {
      try {
        compileResults = this.compilerInstance.transpileFile(file.contents.toString(), options);
      } catch (error) {
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
    } else {
      // compiler doesn't support this file type. copy the file as is to the dist dir.
      this.dists.push(new Dist({ base, path: path.join(base, file.relative), contents: file.contents }));
    }
  }
}

export class WorkspaceCompiler {
  constructor(private workspace: Workspace, private envs: EnvsMain, private pubsub: PubsubMain) {
    if (this.workspace) {
      this.workspace.registerOnComponentChange(this.onComponentChange.bind(this));
      this.workspace.registerOnComponentAdd(this.onComponentChange.bind(this));
    }
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
    const componentIds = await this.getIdsToCompile(componentsIds, options.changed);
    // const { components } = await this.workspace.consumer.loadComponents(BitIds.fromArray(bitIds));
    const components = await this.workspace.getMany(componentIds);

    const componentsWithLegacyCompilers: ConsumerComponent[] = [];
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
      } else {
        componentsWithLegacyCompilers.push(c.state._consumer);
      }
    });
    let newCompilersResultOnWorkspace: BuildResult[] = [];
    let oldCompilersResult: BuildResult[] = [];
    if (componentsAndNewCompilers.length) {
      newCompilersResultOnWorkspace = await BluebirdPromise.mapSeries(
        componentsAndNewCompilers,
        (componentAndNewCompilers) => componentAndNewCompilers.compile(noThrow)
      );
    }
    if (componentsWithLegacyCompilers.length) {
      oldCompilersResult = await this.compileWithLegacyCompilers(componentsWithLegacyCompilers);
    }

    return [...newCompilersResultOnWorkspace, ...oldCompilersResult];
  }

  private async compileWithLegacyCompilers(components: ConsumerComponent[]): Promise<BuildResult[]> {
    logger.debugAndAddBreadCrumb('scope.buildMultiple', 'using the legacy build mechanism');
    const build = async (component: ConsumerComponent) => {
      if (component.compiler) loader.start(`building component - ${component.id}`);
      await component.build({
        scope: this.workspace.consumer.scope,
        consumer: this.workspace.consumer,
      });
      const buildResults = await component.dists.writeDists(component, this.workspace.consumer, false);
      if (component.compiler) loader.succeed();
      return { component: component.id.toString(), buildResults };
    };
    const writeLinks = async (component: ConsumerComponent) =>
      component.dists.writeDistsLinks(component, this.workspace.consumer);

    const buildResults = await BluebirdPromise.mapSeries(components, build);
    await BluebirdPromise.mapSeries(components, writeLinks);

    return buildResults;
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
