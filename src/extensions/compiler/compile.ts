/* eslint-disable max-classes-per-file */
import path from 'path';
import BluebirdPromise from 'bluebird';
import { Workspace } from '../workspace';
import { DEFAULT_DIST_DIRNAME } from './../../constants';
import ConsumerComponent from '../../consumer/component';
import { BitId, BitIds } from '../../bit-id';
import DataToPersist from '../../consumer/component/sources/data-to-persist';
import logger from '../../logger/logger';
import loader from '../../cli/loader';
import { Dist, SourceFile } from '../../consumer/component/sources';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import { Environments } from '../environments';
import { Compiler } from './types';

type BuildResult = { component: string; buildResults: string[] | null | undefined };

type LegacyCompilerOptions = {
  noCache?: boolean;
  verbose?: boolean;
  dontPrintEnvMsg?: boolean;
};

export class ComponentCompiler {
  constructor(
    private workspace: Workspace,
    private component: ConsumerComponent,
    private compilerInstance: Compiler,
    private compilerId: string,
    private dists: Dist[] = [],
    private compileErrors: { path: string; error: Error }[] = []
  ) {}

  async compile(): Promise<BuildResult> {
    // const { component, compilerName: compilerId, compilerInstance } = componentAndNewCompiler;
    if (!this.compilerInstance.transpileFile) {
      throw new Error(`compiler ${this.compilerId.toString()} doesn't implement "transpileFile" interface`);
    }
    await Promise.all(this.component.files.map((file) => this.compileOneFileWithNewCompiler(file)));
    this.throwOnCompileErrors();
    // writing the dists with `component.setDists(dists); component.dists.writeDists` is tricky
    // as it uses other base-paths and doesn't respect the new node-modules base path.
    const dataToPersist = new DataToPersist();
    dataToPersist.addManyFiles(this.dists);
    dataToPersist.addBasePath(this.workspace.path);
    await dataToPersist.persistAllToFS();
    const buildResults = this.dists.map((distFile) => distFile.path);
    if (this.component.compiler) loader.succeed();
    return { component: this.component.id.toString(), buildResults };
  }

  private throwOnCompileErrors() {
    if (this.compileErrors.length) {
      const formatError = (errorItem) => `${errorItem.path}\n${errorItem.error}`;
      throw new Error(`compilation failed. see the following errors from the compiler
${this.compileErrors.map(formatError).join('\n')}`);
    }
  }

  private get distDir() {
    const packageName = componentIdToPackageName(this.component);
    const packageDir = path.join('node_modules', packageName);
    const distDirName = DEFAULT_DIST_DIRNAME;
    return path.join(packageDir, distDirName);
  }

  private get componentDir() {
    const relativeComponentDir = this.component.componentMap?.getComponentDir();
    if (!relativeComponentDir)
      throw new Error(`compileWithNewCompilersOnWorkspace expect to get only components with rootDir`);
    return path.join(this.workspace.path, relativeComponentDir);
  }

  private async compileOneFileWithNewCompiler(file: SourceFile) {
    const options = { componentDir: this.componentDir, filePath: file.relative };
    let compileResults;
    try {
      compileResults = this.compilerInstance.transpileFile(file.contents.toString(), options);
    } catch (error) {
      this.compileErrors.push({ path: file.path, error });
      return;
    }
    const base = this.distDir;
    if (compileResults) {
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
  constructor(private workspace: Workspace, private envs: Environments) {}

  async compileComponents(
    componentsIds: string[] | BitId[], // when empty, it compiles all
    options: LegacyCompilerOptions
  ): Promise<BuildResult[]> {
    const bitIds = this.getBitIds(componentsIds);
    const { components } = await this.workspace.consumer.loadComponents(BitIds.fromArray(bitIds));
    const componentsWithLegacyCompilers: ConsumerComponent[] = [];
    const componentsAndNewCompilers: ComponentCompiler[] = [];
    components.forEach((c) => {
      const environment = this.envs.getEnvFromExtensions(c.extensions);
      const compilerInstance = environment?.getCompiler();
      // if there is no componentDir (e.g. author that added files, not dir), then we can't write the dists
      // inside the component dir.
      if (compilerInstance && c.componentMap?.getComponentDir()) {
        const compilerName = compilerInstance.constructor.name || 'compiler';
        componentsAndNewCompilers.push(new ComponentCompiler(this.workspace, c, compilerInstance, compilerName));
      } else {
        componentsWithLegacyCompilers.push(c);
      }
    });
    let newCompilersResultOnWorkspace: BuildResult[] = [];
    let oldCompilersResult: BuildResult[] = [];
    if (componentsAndNewCompilers.length) {
      newCompilersResultOnWorkspace = await BluebirdPromise.mapSeries(
        componentsAndNewCompilers,
        (componentAndNewCompilers) => componentAndNewCompilers.compile()
      );
    }
    if (componentsWithLegacyCompilers.length) {
      oldCompilersResult = await this.compileWithLegacyCompilers(componentsWithLegacyCompilers, options);
    }

    return [...newCompilersResultOnWorkspace, ...oldCompilersResult];
  }

  private async compileWithLegacyCompilers(
    components: ConsumerComponent[],
    options: LegacyCompilerOptions
  ): Promise<BuildResult[]> {
    logger.debugAndAddBreadCrumb('scope.buildMultiple', 'using the legacy build mechanism');
    const build = async (component: ConsumerComponent) => {
      if (component.compiler) loader.start(`building component - ${component.id}`);
      await component.build({
        scope: this.workspace.consumer.scope,
        consumer: this.workspace.consumer,
        ...options,
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

  private getBitIds(componentsIds: Array<string | BitId>): BitId[] {
    if (componentsIds.length) {
      return componentsIds.map((compId) =>
        compId instanceof BitId ? compId : this.workspace.consumer.getParsedId(compId)
      );
    }
    return this.workspace.consumer.bitMap.getAuthoredAndImportedBitIds();
  }
}
