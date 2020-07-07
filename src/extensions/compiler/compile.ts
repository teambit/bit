import path from 'path';
import pMapSeries from 'p-map-series';
import { Workspace } from '../workspace';
import { DEFAULT_DIST_DIRNAME } from './../../constants';
import ConsumerComponent from '../../consumer/component';
import { BitId, BitIds } from '../../bit-id';
import buildComponent from '../../consumer/component-ops/build-component';
import DataToPersist from '../../consumer/component/sources/data-to-persist';
import logger from '../../logger/logger';
import loader from '../../cli/loader';
import { Dist } from '../../consumer/component/sources';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import { searchFilesIgnoreExt, pathJoinLinux } from '../../utils';
import PackageJsonFile from '../../consumer/component/package-json-file';
import { Environments } from '../environments';
import { CompilerTask } from './compiler.task';
import { Compiler } from './types';
import { Component } from '../component';
import { Capsule } from '../isolator';

type BuildResult = { component: string; buildResults: string[] | null | undefined };

type ComponentsAndNewCompilers = {
  component: ConsumerComponent;
  compilerInstance: Compiler;
  compilerName: string;
};

export class Compile {
  constructor(private workspace: Workspace, private envs: Environments, readonly task: CompilerTask) {}

  async compileOnWorkspace(
    componentsIds: string[] | BitId[], // when empty, it compiles all
    noCache?: boolean,
    verbose?: boolean,
    dontPrintEnvMsg?: boolean
  ): Promise<BuildResult[]> {
    const bitIds = getBitIds(componentsIds, this.workspace);
    const { components } = await this.workspace.consumer.loadComponents(BitIds.fromArray(bitIds));
    const componentsWithLegacyCompilers: ConsumerComponent[] = [];
    const componentsAndNewCompilers: ComponentsAndNewCompilers[] = [];
    components.forEach(c => {
      const environment = this.envs.getEnvFromExtensions(c.extensions);
      const compilerInstance = environment?.getCompiler();
      // if there is no componentDir (e.g. author that added files, not dir), then we can't write the dists
      // inside the component dir.
      if (compilerInstance && c.componentMap?.getComponentDir()) {
        const compilerName = compilerInstance.constructor.name || 'compiler';
        componentsAndNewCompilers.push({ component: c, compilerInstance, compilerName });
      } else {
        componentsWithLegacyCompilers.push(c);
      }
    });
    let newCompilersResultOnWorkspace: BuildResult[] = [];
    let oldCompilersResult: BuildResult[] = [];
    if (componentsAndNewCompilers.length) {
      newCompilersResultOnWorkspace = await this.compileWithNewCompilersOnWorkspace(componentsAndNewCompilers);
    }
    if (componentsWithLegacyCompilers.length) {
      oldCompilersResult = await this.compileWithLegacyCompilers(
        componentsWithLegacyCompilers,
        noCache,
        verbose,
        dontPrintEnvMsg
      );
    }

    return [...newCompilersResultOnWorkspace, ...oldCompilersResult];
  }

  private async compileWithNewCompilersOnWorkspace(
    componentsAndNewCompilers: ComponentsAndNewCompilers[]
  ): Promise<BuildResult[]> {
    const build = async ({ component, compilerName: compilerId, compilerInstance }: ComponentsAndNewCompilers) => {
      if (!compilerInstance.compileFile) {
        throw new Error(`compiler ${compilerId.toString()} doesn't implement "compileFile" interface`);
      }
      const packageName = componentIdToPackageName(component);
      const packageDir = path.join('node_modules', packageName);
      const distDirName = DEFAULT_DIST_DIRNAME;
      const distDir = path.join(packageDir, distDirName);
      const dists: Dist[] = [];
      const compileErrors: { path: string; error: Error }[] = [];
      await Promise.all(
        component.files.map(async file => {
          const relativeComponentDir = component.componentMap?.getComponentDir();
          if (!relativeComponentDir)
            throw new Error(`compileWithNewCompilersOnWorkspace expect to get only components with rootDir`);
          const componentDir = path.join(this.workspace.path, relativeComponentDir);
          const options = { componentDir, filePath: file.relative };
          let compileResults;
          try {
            compileResults = compilerInstance.compileFile(file.contents.toString(), options);
          } catch (error) {
            compileErrors.push({ path: file.path, error });
            return;
          }
          const base = distDir;
          if (compileResults) {
            dists.push(
              ...compileResults.map(
                result =>
                  new Dist({
                    base,
                    path: path.join(base, result.outputPath),
                    contents: Buffer.from(result.outputText)
                  })
              )
            );
          } else {
            // compiler doesn't support this file type. copy the file as is to the dist dir.
            dists.push(new Dist({ base, path: path.join(base, file.relative), contents: file.contents }));
          }
        })
      );
      if (compileErrors.length) {
        const formatError = errorItem => `${errorItem.path}\n${errorItem.error}`;
        throw new Error(`compilation failed. see the following errors from the compiler
${compileErrors.map(formatError).join('\n')}`);
      }
      // writing the dists with `component.setDists(dists); component.dists.writeDists` is tricky
      // as it uses other base-paths and doesn't respect the new node-modules base path.
      const dataToPersist = new DataToPersist();
      dataToPersist.addManyFiles(dists);
      const found = searchFilesIgnoreExt(dists, component.mainFile, 'relative');
      if (!found) throw new Error(`unable to find dist main file for ${component.id.toString()}`);
      const packageJson = PackageJsonFile.loadFromPathSync(this.workspace.path, packageDir);
      if (!packageJson.fileExist) {
        throw new Error(`failed finding package.json file in ${packageDir}, please run "bit link"`);
      }
      packageJson.addOrUpdateProperty('main', pathJoinLinux(distDirName, found));
      dataToPersist.addFile(packageJson.toVinylFile());
      dataToPersist.addBasePath(this.workspace.path);
      await dataToPersist.persistAllToFS();
      const oneBuildResults = dists.map(distFile => distFile.path);
      if (component.compiler) loader.succeed();
      return { component: component.id.toString(), buildResults: oneBuildResults };
    };
    const allBuildResults = await pMapSeries(componentsAndNewCompilers, build);
    return allBuildResults;
  }

  async compileWithLegacyCompilers(
    components: ConsumerComponent[],
    noCache?: boolean,
    verbose?: boolean,
    dontPrintEnvMsg?: boolean
  ): Promise<BuildResult[]> {
    logger.debugAndAddBreadCrumb('scope.buildMultiple', 'using the legacy build mechanism');
    const build = async (component: ConsumerComponent) => {
      if (component.compiler) loader.start(`building component - ${component.id}`);
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
}

function getBitIds(componentsIds: Array<string | BitId>, workspace: Workspace): BitId[] {
  if (componentsIds.length) {
    return componentsIds.map(compId => (compId instanceof BitId ? compId : workspace.consumer.getParsedId(compId)));
  }
  return workspace.consumer.bitMap.getAuthoredAndImportedBitIds();
}

export type ComponentAndCapsule = {
  consumerComponent: ConsumerComponent;
  component: Component;
  capsule: Capsule;
};
