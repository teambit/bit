import { MainRuntime } from '@teambit/cli';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import InstallAspect, { InstallMain } from '@teambit/install';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { BitError } from '@teambit/bit-error';
import fs from 'fs-extra';
import mapSeries from 'p-map-series';
import * as path from 'path';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import { ComponentWithDependencies } from '@teambit/legacy/dist/scope';
import { isDir, isDirEmptySync } from '@teambit/legacy/dist/utils';
import { PathLinuxRelative, pathNormalizeToLinux, PathOsBasedAbsolute } from '@teambit/legacy/dist/utils/path';
import ComponentMap from '@teambit/legacy/dist/consumer/bit-map/component-map';
import DataToPersist from '@teambit/legacy/dist/consumer/component/sources/data-to-persist';
import Consumer from '@teambit/legacy/dist/consumer/consumer';
import { moveExistingComponent } from '@teambit/legacy/dist/consumer/component-ops/move-components';
import ComponentWriter, { ComponentWriterProps } from './component-writer';
import { ComponentWriterAspect } from './component-writer.aspect';

export interface ManyComponentsWriterParams {
  componentsWithDependencies: ComponentWithDependencies[];
  writeToPath?: string;
  throwForExistingDir?: boolean;
  writeConfig?: boolean;
  skipDependencyInstallation?: boolean;
  verbose?: boolean;
  resetConfig?: boolean;
}

export type ComponentWriterResults = { installationError?: Error };

export class ComponentWriterMain {
  constructor(
    private installer: InstallMain,
    private compiler: CompilerMain,
    private workspace: Workspace,
    private logger: Logger
  ) {}

  get consumer(): Consumer {
    return this.workspace.consumer;
  }

  async writeMany(opts: ManyComponentsWriterParams): Promise<ComponentWriterResults> {
    this.logger.debug('writeMany, started');
    await this.populateComponentsFilesToWrite(opts);
    this.moveComponentsIfNeeded(opts);
    await this.persistComponentsData(opts);
    let installationError: Error | undefined;
    if (!opts.skipDependencyInstallation) {
      installationError = await this.installPackagesGracefully();
      await this.compile(); // no point to compile if the installation is not running. the environment is not ready.
    }
    await this.consumer.writeBitMap();
    this.logger.debug('writeMany, completed!');
    return { installationError };
  }

  private async installPackagesGracefully() {
    this.logger.debug('installPackagesGracefully, start installing packages');
    try {
      const installOpts = {
        dedupe: true,
        updateExisting: false,
        import: false,
      };
      await this.installer.install(undefined, installOpts);
      this.logger.debug('installPackagesGracefully, completed installing packages successfully');
      return undefined;
    } catch (err: any) {
      this.logger.consoleFailure(`installation failed with the following error: ${err.message}`);
      this.logger.error('installPackagesGracefully, package-installer found an error', err);
      return err;
    }
  }
  private async compile() {
    try {
      await this.compiler.compileOnWorkspace();
    } catch (err: any) {
      this.logger.error('compile, compiler found an error', err);
      throw new BitError(`failed compiling the components. please run "bit compile" once the issue is fixed
error from the compiler: ${err.message}.
please use the '--log=error' flag for the full error.`);
    }
  }
  private async persistComponentsData(opts: ManyComponentsWriterParams) {
    const dataToPersist = new DataToPersist();
    opts.componentsWithDependencies.forEach((componentWithDeps) => {
      const allComponents = [componentWithDeps.component, ...componentWithDeps.allDependencies];
      allComponents.forEach((component) => dataToPersist.merge(component.dataToPersist));
    });
    const componentsConfig = this.consumer?.config?.componentsConfig;
    if (componentsConfig?.hasChanged) {
      const jsonFiles = await this.consumer?.config.toVinyl(this.consumer.getPath());
      if (jsonFiles) {
        dataToPersist.addManyFiles(jsonFiles);
      }
    }
    dataToPersist.addBasePath(this.consumer.getPath());
    await dataToPersist.persistAllToFS();
  }
  private async populateComponentsFilesToWrite(opts: ManyComponentsWriterParams) {
    const writeComponentsParams = opts.componentsWithDependencies.map((componentWithDeps: ComponentWithDependencies) =>
      this.getWriteParamsOfOneComponent(componentWithDeps, opts)
    );
    const componentWriterInstances = writeComponentsParams.map((writeParams) => new ComponentWriter(writeParams));
    this.fixDirsIfNested(componentWriterInstances);
    // add componentMap entries into .bitmap before starting the process because steps like writing package-json
    // rely on .bitmap to determine whether a dependency exists and what's its origin
    componentWriterInstances.forEach((componentWriter: ComponentWriter) => {
      componentWriter.existingComponentMap =
        componentWriter.existingComponentMap || componentWriter.addComponentToBitMap(componentWriter.writeToPath);
    });
    if (opts.resetConfig) {
      componentWriterInstances.forEach((componentWriter: ComponentWriter) => {
        delete componentWriter.existingComponentMap?.config;
      });
    }
    await mapSeries(componentWriterInstances, (componentWriter: ComponentWriter) =>
      componentWriter.populateComponentsFilesToWrite()
    );
  }
  /**
   * e.g. [bar, bar/foo] => [bar_1, bar/foo]
   * otherwise, the bar/foo component will be saved inside "bar" component.
   * in case bar_1 is taken, increment to bar_2 until the name is available.
   */
  private fixDirsIfNested(componentWriterInstances: ComponentWriter[]) {
    const allDirs = componentWriterInstances.map((c) => c.writeToPath);

    // get all components that their root-dir is a parent of other components root-dir.
    const parentsOfOthersComps = componentWriterInstances.filter(({ writeToPath }) =>
      allDirs.find((d) => d.startsWith(`${writeToPath}/`))
    );
    if (!parentsOfOthersComps.length) {
      return;
    }
    const parentsOfOthersCompsDirs = parentsOfOthersComps.map((c) => c.writeToPath);

    const incrementPath = (p: string, number: number) => `${p}_${number}`;
    const existingRootDirs = Object.keys(this.consumer.bitMap.getAllTrackDirs());
    const allPaths: PathLinuxRelative[] = [...existingRootDirs, ...parentsOfOthersCompsDirs];
    const incrementRecursively = (p: string) => {
      let num = 1;
      let newPath = incrementPath(p, num);
      while (allPaths.includes(newPath)) {
        newPath = incrementPath(p, (num += 1));
      }
      return newPath;
    };

    // change the paths of all these parents root-dir to not collide with the children root-dir
    parentsOfOthersComps.forEach((componentWriter) => {
      if (existingRootDirs.includes(componentWriter.writeToPath)) return; // component already exists.
      const newPath = incrementRecursively(componentWriter.writeToPath);
      componentWriter.writeToPath = newPath;
    });
  }

  private getWriteParamsOfOneComponent(
    componentWithDeps: ComponentWithDependencies,
    opts: ManyComponentsWriterParams
  ): ComponentWriterProps {
    const componentRootDir: PathLinuxRelative = opts.writeToPath
      ? pathNormalizeToLinux(this.consumer.getPathRelativeToConsumer(path.resolve(opts.writeToPath)))
      : this.consumer.composeRelativeComponentPath(componentWithDeps.component.id);
    const getParams = () => {
      if (!this.consumer) {
        return {};
      }
      // components can't be saved with multiple versions, so we can ignore the version to find the component in bit.map
      const componentMap = this.consumer.bitMap.getComponentIfExist(componentWithDeps.component.id, {
        ignoreVersion: true,
      });
      this.throwErrorWhenDirectoryNotEmpty(this.consumer.toAbsolutePath(componentRootDir), componentMap, opts);
      return {
        existingComponentMap: componentMap,
      };
    };
    return {
      consumer: this.consumer,
      bitMap: this.consumer.bitMap,
      component: componentWithDeps.component,
      writeToPath: componentRootDir,
      writeConfig: opts.writeConfig,
      ...getParams(),
    };
  }
  private moveComponentsIfNeeded(opts: ManyComponentsWriterParams) {
    if (opts.writeToPath && this.consumer) {
      opts.componentsWithDependencies.forEach((componentWithDeps) => {
        // @ts-ignore componentWithDeps.component.componentMap is set
        const componentMap: ComponentMap = componentWithDeps.component.componentMap;
        if (!componentMap.rootDir) {
          throw new GeneralError(`unable to use "--path" flag.
to move individual files, use bit move.
to move all component files to a different directory, run bit remove and then bit import --path`);
        }
        const relativeWrittenPath = componentWithDeps.component.writtenPath;
        // @ts-ignore relativeWrittenPath is set at this point
        const absoluteWrittenPath = this.consumer.toAbsolutePath(relativeWrittenPath);
        // @ts-ignore this.writeToPath is set at this point
        const absoluteWriteToPath = path.resolve(opts.writeToPath); // don't use consumer.toAbsolutePath, it might be an inner dir
        if (relativeWrittenPath && absoluteWrittenPath !== absoluteWriteToPath) {
          const component = componentWithDeps.component;
          moveExistingComponent(this.consumer, component, absoluteWrittenPath, absoluteWriteToPath);
        }
      });
    }
  }
  private throwErrorWhenDirectoryNotEmpty(
    componentDir: PathOsBasedAbsolute,
    componentMap: ComponentMap | null | undefined,
    opts: ManyComponentsWriterParams
  ) {
    // if not writeToPath specified, it goes to the default directory. When componentMap exists, the
    // component is not new, and it's ok to override the existing directory.
    if (!opts.writeToPath && componentMap) return;
    // if writeToPath specified and that directory is already used for that component, it's ok to override
    if (opts.writeToPath && componentMap && componentMap.rootDir && componentMap.rootDir === opts.writeToPath) return;

    if (fs.pathExistsSync(componentDir)) {
      if (!isDir(componentDir)) {
        throw new GeneralError(`unable to import to ${componentDir} because it's a file`);
      }
      if (!isDirEmptySync(componentDir) && opts.throwForExistingDir) {
        throw new GeneralError(
          `unable to import to ${componentDir}, the directory is not empty. use --override flag to delete the directory and then import`
        );
      }
    }
  }

  static slots = [];
  static dependencies = [InstallAspect, CompilerAspect, LoggerAspect, WorkspaceAspect];
  static runtime = MainRuntime;
  static async provider([install, compiler, loggerMain, workspace]: [
    InstallMain,
    CompilerMain,
    LoggerMain,
    Workspace
  ]) {
    const logger = loggerMain.createLogger(ComponentWriterAspect.id);
    return new ComponentWriterMain(install, compiler, workspace, logger);
  }
}

ComponentWriterAspect.addRuntime(ComponentWriterMain);

export default ComponentWriterMain;
