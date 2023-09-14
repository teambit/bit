import { MainRuntime } from '@teambit/cli';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import InstallAspect, { InstallMain } from '@teambit/install';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { BitError } from '@teambit/bit-error';
import fs from 'fs-extra';
import mapSeries from 'p-map-series';
import * as path from 'path';
import MoverAspect, { MoverMain } from '@teambit/mover';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import { isDir, isDirEmptySync } from '@teambit/legacy/dist/utils';
import { PathLinuxRelative, pathNormalizeToLinux, PathOsBasedAbsolute } from '@teambit/legacy/dist/utils/path';
import ComponentMap from '@teambit/legacy/dist/consumer/bit-map/component-map';
import DataToPersist from '@teambit/legacy/dist/consumer/component/sources/data-to-persist';
import Consumer from '@teambit/legacy/dist/consumer/consumer';
import ComponentWriter, { ComponentWriterProps } from './component-writer';
import { ComponentWriterAspect } from './component-writer.aspect';

export interface ManyComponentsWriterParams {
  components: ConsumerComponent[];
  writeToPath?: string;
  throwForExistingDir?: boolean;
  writeConfig?: boolean;
  skipDependencyInstallation?: boolean;
  verbose?: boolean;
  resetConfig?: boolean;
  skipWritingToFs?: boolean;
  skipUpdatingBitMap?: boolean;
}

export type ComponentWriterResults = { installationError?: Error; compilationError?: Error };

export class ComponentWriterMain {
  constructor(
    private installer: InstallMain,
    private compiler: CompilerMain,
    private workspace: Workspace,
    private logger: Logger,
    private mover: MoverMain
  ) {}

  get consumer(): Consumer {
    return this.workspace.consumer;
  }

  async writeMany(opts: ManyComponentsWriterParams): Promise<ComponentWriterResults> {
    this.logger.debug('writeMany, started');
    await this.populateComponentsFilesToWrite(opts);
    this.moveComponentsIfNeeded(opts);
    await this.persistComponentsData(opts);
    if (!opts.skipUpdatingBitMap) await this.consumer.writeBitMap();
    let installationError: Error | undefined;
    let compilationError: Error | undefined;
    if (!opts.skipDependencyInstallation) {
      installationError = await this.installPackagesGracefully();
      // no point to compile if the installation is not running. the environment is not ready.
      compilationError = await this.compileGracefully();
    }
    this.logger.debug('writeMany, completed!');
    return { installationError, compilationError };
  }

  private async installPackagesGracefully(): Promise<Error | undefined> {
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
  private async compileGracefully(): Promise<Error | undefined> {
    try {
      await this.compiler.compileOnWorkspace();
      return undefined;
    } catch (err: any) {
      this.logger.consoleFailure(`compilation failed with the following error: ${err.message}`);
      this.logger.error('compileGracefully, compiler found an error', err);
      return err;
    }
  }
  private async persistComponentsData(opts: ManyComponentsWriterParams) {
    if (opts.skipWritingToFs) return;
    const dataToPersist = new DataToPersist();
    opts.components.forEach((component) => dataToPersist.merge(component.dataToPersist));
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
    const writeComponentsParams = opts.components.map((component) =>
      this.getWriteParamsOfOneComponent(component, opts)
    );
    const componentWriterInstances = writeComponentsParams.map((writeParams) => new ComponentWriter(writeParams));
    this.fixDirsIfNested(componentWriterInstances);
    // add componentMap entries into .bitmap before starting the process because steps like writing package-json
    // rely on .bitmap to determine whether a dependency exists and what's its origin
    await Promise.all(
      componentWriterInstances.map(async (componentWriter: ComponentWriter) => {
        componentWriter.existingComponentMap =
          componentWriter.existingComponentMap ||
          (await componentWriter.addComponentToBitMap(componentWriter.writeToPath));
      })
    );
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
    const existingRootDirs = Object.keys(this.consumer.bitMap.getAllTrackDirs());
    const incrementPath = (p: string, number: number) => `${p}_${number}`;
    const parentsOfOthersCompsDirs = parentsOfOthersComps.map((c) => c.writeToPath);
    const allPaths: PathLinuxRelative[] = [...existingRootDirs, ...parentsOfOthersCompsDirs];
    const incrementRecursively = (p: string) => {
      let num = 1;
      let newPath = incrementPath(p, num);
      while (allPaths.includes(newPath)) {
        newPath = incrementPath(p, (num += 1));
      }
      return newPath;
    };

    // this is when writing multiple components and some of them are parents of the others.
    // change the paths of all these parents root-dir to not collide with the children root-dir
    parentsOfOthersComps.forEach((componentWriter) => {
      if (existingRootDirs.includes(componentWriter.writeToPath)) return; // component already exists.
      const newPath = incrementRecursively(componentWriter.writeToPath);
      componentWriter.writeToPath = newPath;
    });

    // this part is when a component's rootDir we about to write is a children of an existing rootDir.
    // e.g. we're now writing "foo", when an existing component has "foo/bar" as the rootDir.
    // in this case, we change "foo" to be "foo_1".
    componentWriterInstances.forEach((componentWriter) => {
      const existingParent = existingRootDirs.find((d) => d.startsWith(`${componentWriter.writeToPath}/`));
      if (!existingParent) return;
      if (existingRootDirs.includes(componentWriter.writeToPath)) return; // component already exists.
      const newPath = incrementRecursively(componentWriter.writeToPath);
      componentWriter.writeToPath = newPath;
    });

    // this part if when for example an existing rootDir is "comp1" and currently written component is "comp1/foo".
    // obviously we don't want to change existing dirs. we change the "comp1/foo" to be "comp1_1/foo".
    componentWriterInstances.forEach((componentWriter) => {
      const existingChildren = existingRootDirs.find((d) => componentWriter.writeToPath.startsWith(`${d}/`));
      if (!existingChildren) return;
      // we increment the existing one, because it is used to replace the base-path of the current component
      const newPath = incrementRecursively(existingChildren);
      componentWriter.writeToPath = componentWriter.writeToPath.replace(existingChildren, newPath);
    });
  }

  private getWriteParamsOfOneComponent(
    component: ConsumerComponent,
    opts: ManyComponentsWriterParams
  ): ComponentWriterProps {
    const componentRootDir: PathLinuxRelative = opts.writeToPath
      ? pathNormalizeToLinux(this.consumer.getPathRelativeToConsumer(path.resolve(opts.writeToPath)))
      : this.consumer.composeRelativeComponentPath(component.id);
    const getParams = () => {
      if (!this.consumer) {
        return {};
      }
      // components can't be saved with multiple versions, so we can ignore the version to find the component in bit.map
      const componentMap = this.consumer.bitMap.getComponentIfExist(component.id, {
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
      component,
      writeToPath: componentRootDir,
      writeConfig: opts.writeConfig,
      skipUpdatingBitMap: opts.skipUpdatingBitMap,
      ...getParams(),
    };
  }
  private moveComponentsIfNeeded(opts: ManyComponentsWriterParams) {
    if (opts.writeToPath && this.consumer) {
      opts.components.forEach((component) => {
        const componentMap = component.componentMap as ComponentMap;
        if (!componentMap.rootDir) {
          throw new GeneralError(`unable to use "--path" flag.
to move individual files, use bit move.
to move all component files to a different directory, run bit remove and then bit import --path`);
        }
        const relativeWrittenPath = component.writtenPath;
        // @ts-ignore relativeWrittenPath is set at this point
        const absoluteWrittenPath = this.consumer.toAbsolutePath(relativeWrittenPath);
        // @ts-ignore this.writeToPath is set at this point
        const absoluteWriteToPath = path.resolve(opts.writeToPath); // don't use consumer.toAbsolutePath, it might be an inner dir
        if (relativeWrittenPath && absoluteWrittenPath !== absoluteWriteToPath) {
          this.mover.moveExistingComponent(component, absoluteWrittenPath, absoluteWriteToPath);
        }
      });
    }
  }
  private throwErrorWhenDirectoryNotEmpty(
    componentDir: PathOsBasedAbsolute,
    componentMap: ComponentMap | null | undefined,
    opts: ManyComponentsWriterParams
  ) {
    if (opts.skipWritingToFs) return;
    // if not writeToPath specified, it goes to the default directory. When componentMap exists, the
    // component is not new, and it's ok to override the existing directory.
    if (!opts.writeToPath && componentMap) return;
    // if writeToPath specified and that directory is already used for that component, it's ok to override
    if (opts.writeToPath && componentMap && componentMap.rootDir && componentMap.rootDir === opts.writeToPath) return;

    if (fs.pathExistsSync(componentDir)) {
      if (!isDir(componentDir)) {
        throw new BitError(`unable to import to ${componentDir} because it's a file`);
      }
      if (!isDirEmptySync(componentDir) && opts.throwForExistingDir) {
        throw new BitError(
          `unable to import to ${componentDir}, the directory is not empty. use --override flag to delete the directory and then import`
        );
      }
    }
  }

  static slots = [];
  static dependencies = [InstallAspect, CompilerAspect, LoggerAspect, WorkspaceAspect, MoverAspect];
  static runtime = MainRuntime;
  static async provider([install, compiler, loggerMain, workspace, mover]: [
    InstallMain,
    CompilerMain,
    LoggerMain,
    Workspace,
    MoverMain
  ]) {
    const logger = loggerMain.createLogger(ComponentWriterAspect.id);
    return new ComponentWriterMain(install, compiler, workspace, logger, mover);
  }
}

ComponentWriterAspect.addRuntime(ComponentWriterMain);

export default ComponentWriterMain;
