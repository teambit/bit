import { MainRuntime } from '@teambit/cli';
import { ComponentID } from '@teambit/component-id';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import { InstallAspect, InstallMain } from '@teambit/install';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { WorkspaceAspect, Workspace } from '@teambit/workspace';
import { BitError } from '@teambit/bit-error';
import fs from 'fs-extra';
import { uniq } from 'lodash';
import mapSeries from 'p-map-series';
import * as path from 'path';
import { MoverAspect, MoverMain } from '@teambit/mover';
import { ConsumerComponent } from '@teambit/legacy.consumer-component';
import {
  isDir,
  isDirEmptySync,
  PathLinuxRelative,
  pathNormalizeToLinux,
  PathOsBasedAbsolute,
} from '@teambit/legacy.utils';
import { ComponentMap } from '@teambit/legacy.bit-map';
import { COMPONENT_CONFIG_FILE_NAME } from '@teambit/legacy.constants';
import { DataToPersist } from '@teambit/component.sources';
import { ConfigMergerAspect, ConfigMergerMain, WorkspaceConfigUpdateResult } from '@teambit/config-merger';
import { MergeStrategy } from '@teambit/merging';
import { Consumer } from '@teambit/legacy.consumer';
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
  skipWriteConfigFiles?: boolean;
  reasonForBitmapChange?: string; // optional. will be written in the bitmap-history-metadata
  shouldUpdateWorkspaceConfig?: boolean; // whether it should update dependencies policy (or leave conflicts) in workspace.jsonc
  mergeStrategy?: MergeStrategy; // needed for workspace.jsonc conflicts
  writeDeps?: 'package.json' | 'workspace.jsonc';
}

export type ComponentWriterResults = {
  installationError?: Error;
  compilationError?: Error;
  workspaceConfigUpdateResult?: WorkspaceConfigUpdateResult;
};

export class ComponentWriterMain {
  constructor(
    private installer: InstallMain,
    private compiler: CompilerMain,
    private workspace: Workspace,
    private logger: Logger,
    private mover: MoverMain,
    private configMerge: ConfigMergerMain
  ) {}

  get consumer(): Consumer {
    return this.workspace.consumer;
  }

  async writeMany(opts: ManyComponentsWriterParams): Promise<ComponentWriterResults> {
    if (!opts.components.length) return {};
    this.logger.debug('writeMany, started');
    await this.populateComponentsFilesToWrite(opts);
    this.moveComponentsIfNeeded(opts);
    await this.persistComponentsData(opts);
    if (!opts.skipUpdatingBitMap) await this.consumer.writeBitMap(opts.reasonForBitmapChange);
    let installationError: Error | undefined;
    let compilationError: Error | undefined;
    let workspaceConfigUpdateResult: WorkspaceConfigUpdateResult | undefined;
    if (opts.writeDeps) {
      await this.workspace.writeDependencies(opts.writeDeps);
    }
    if (opts.shouldUpdateWorkspaceConfig) {
      workspaceConfigUpdateResult = await this.configMerge.updateDepsInWorkspaceConfig(
        opts.components,
        opts.mergeStrategy
      );
    }
    if (this.workspace.externalPackageManagerIsUsed()) {
      await this.workspace.writeDependenciesToPackageJson();
    } else if (!opts.skipDependencyInstallation) {
      installationError = await this.installPackagesGracefully(
        opts.components.map(({ id }) => id),
        opts.skipWriteConfigFiles
      );
      // no point to compile if the installation is not running. the environment is not ready.
      compilationError = await this.compileGracefully();
    }
    this.logger.debug('writeMany, completed!');
    return { installationError, compilationError, workspaceConfigUpdateResult };
  }

  private async installPackagesGracefully(
    componentIds: ComponentID[],
    skipWriteConfigFiles = false
  ): Promise<Error | undefined> {
    this.logger.debug('installPackagesGracefully, start installing packages');
    try {
      const installOpts = {
        dedupe: true,
        updateExisting: false,
        import: false,
        writeConfigFiles: !skipWriteConfigFiles,
        dependenciesGraph: await this.workspace.scope.getDependenciesGraphByComponentIds(componentIds),
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
    dataToPersist.addBasePath(this.consumer.getPath());
    await dataToPersist.persistAllToFS();
  }
  private async populateComponentsFilesToWrite(opts: ManyComponentsWriterParams) {
    const writeComponentsParams = opts.components.map((component) =>
      this.getWriteParamsOfOneComponent(component, opts)
    );
    const componentWriterInstances = writeComponentsParams.map((writeParams) => new ComponentWriter(writeParams));
    this.fixDirsIfEqual(componentWriterInstances);
    this.fixDirsIfNested(componentWriterInstances);
    // add componentMap entries into .bitmap before starting the process because steps like writing package-json
    // rely on .bitmap to determine whether a dependency exists and what's its origin
    await Promise.all(
      componentWriterInstances.map(async (componentWriter: ComponentWriter) => {
        componentWriter.existingComponentMap =
          componentWriter.existingComponentMap ||
          (await componentWriter.addComponentToBitMap(componentWriter.writeToPath));
        const componentConfigPath = path.join(
          this.workspace.path,
          componentWriter.existingComponentMap.rootDir,
          COMPONENT_CONFIG_FILE_NAME
        );
        const componentConfigExist = await fs.pathExists(componentConfigPath);
        componentWriter.writeConfig = componentWriter.writeConfig || componentConfigExist;
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
   * this started to be an issue once same-name different-scope is supported.
   * by default, the component-dir consist of the scope-name part of the scope-id, without the owner part.
   * as a result, it's possible that multiple components have the same name, same scope-name but different owner.
   * e.g. org1.ui/button and org2.ui/button. the component-dir for both is "ui/button".
   * in this case, we try to prefix the component-dir with the owner-name and if not possible, just increment it (ui/button_1)
   */
  private fixDirsIfEqual(componentWriterInstances: ComponentWriter[]) {
    const allDirs = componentWriterInstances.map((c) => c.writeToPath);
    const duplicatedDirs = allDirs.filter((dir) => allDirs.filter((d) => d === dir).length > 1);
    if (!duplicatedDirs.length) return;
    const uniqDuplicates = uniq(duplicatedDirs);
    uniqDuplicates.forEach((compDir) => {
      const hasDuplication = componentWriterInstances.filter((compWriter) => compWriter.writeToPath === compDir);
      hasDuplication.forEach((compWriter) => {
        const ownerName = compWriter.component.id.scope?.includes('.')
          ? compWriter.component.id.scope.split('.')[0]
          : undefined;
        if (ownerName && !compDir.startsWith(ownerName) && !allDirs.includes(`${ownerName}/${compDir}`)) {
          compWriter.writeToPath = `${ownerName}/${compDir}`;
        } else {
          compWriter.writeToPath = incrementPathRecursively(compWriter.writeToPath, allDirs);
        }
        allDirs.push(compWriter.writeToPath);
      });
    });
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
    const existingRootDirs = this.workspace.bitMap.getAllRootDirs();
    const parentsOfOthersCompsDirs = parentsOfOthersComps.map((c) => c.writeToPath);
    const allPaths: PathLinuxRelative[] = [...existingRootDirs, ...parentsOfOthersCompsDirs];

    // this is when writing multiple components and some of them are parents of the others.
    // change the paths of all these parents root-dir to not collide with the children root-dir
    parentsOfOthersComps.forEach((componentWriter) => {
      if (existingRootDirs.includes(componentWriter.writeToPath)) return; // component already exists.
      const newPath = incrementPathRecursively(componentWriter.writeToPath, allPaths);
      componentWriter.writeToPath = newPath;
    });

    // this part is when a component's rootDir we about to write is a children of an existing rootDir.
    // e.g. we're now writing "foo", when an existing component has "foo/bar" as the rootDir.
    // in this case, we change "foo" to be "foo_1".
    componentWriterInstances.forEach((componentWriter) => {
      const existingParent = existingRootDirs.find((d) => d.startsWith(`${componentWriter.writeToPath}/`));
      if (!existingParent) return;
      if (existingRootDirs.includes(componentWriter.writeToPath)) return; // component already exists.
      const newPath = incrementPathRecursively(componentWriter.writeToPath, allPaths);
      componentWriter.writeToPath = newPath;
    });

    // this part if when for example an existing rootDir is "comp1" and currently written component is "comp1/foo".
    // obviously we don't want to change existing dirs. we change the "comp1/foo" to be "comp1_1/foo".
    componentWriterInstances.forEach((componentWriter) => {
      const existingChildren = existingRootDirs.find((d) => componentWriter.writeToPath.startsWith(`${d}/`));
      if (!existingChildren) return;
      // we increment the existing one, because it is used to replace the base-path of the current component
      const newPath = incrementPathRecursively(existingChildren, allPaths);
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
      this.throwErrorWhenDirectoryNotEmpty(componentRootDir, componentMap, opts);
      return {
        existingComponentMap: componentMap,
      };
    };
    return {
      workspace: this.workspace,
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
          throw new BitError(`unable to use "--path" flag.
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
    componentDirRelative: PathOsBasedAbsolute,
    componentMap: ComponentMap | null | undefined,
    opts: ManyComponentsWriterParams
  ) {
    if (opts.skipWritingToFs) return;
    // if not writeToPath specified, it goes to the default directory. When componentMap exists, the
    // component is not new, and it's ok to override the existing directory.
    if (!opts.writeToPath && componentMap) return;
    // if writeToPath specified and that directory is already used for that component, it's ok to override
    if (opts.writeToPath && componentMap && componentMap.rootDir && componentMap.rootDir === opts.writeToPath) return;

    const componentDir = this.consumer.toAbsolutePath(componentDirRelative);
    if (!fs.pathExistsSync(componentDir)) return;
    if (!componentMap) {
      const compInTheSameDir = this.consumer.bitMap.getComponentIdByRootPath(componentDirRelative);
      if (compInTheSameDir) {
        throw new BitError(
          `unable to import to ${componentDir}, the directory is already used by ${compInTheSameDir.toString()}.
either use --path to specify a different directory or modify "defaultDirectory" prop in the workspace.jsonc file to "{scopeId}/{name}"`
        );
      }
    }
    if (!isDir(componentDir)) {
      throw new BitError(`unable to import to ${componentDir} because it's a file`);
    }
    if (!isDirEmptySync(componentDir) && opts.throwForExistingDir) {
      throw new BitError(
        `unable to import to ${componentDir}, the directory is not empty. use --override flag to delete the directory and then import`
      );
    }
  }

  static slots = [];
  static dependencies = [InstallAspect, CompilerAspect, LoggerAspect, WorkspaceAspect, MoverAspect, ConfigMergerAspect];
  static runtime = MainRuntime;
  static async provider([install, compiler, loggerMain, workspace, mover, configMerger]: [
    InstallMain,
    CompilerMain,
    LoggerMain,
    Workspace,
    MoverMain,
    ConfigMergerMain,
  ]) {
    const logger = loggerMain.createLogger(ComponentWriterAspect.id);
    return new ComponentWriterMain(install, compiler, workspace, logger, mover, configMerger);
  }
}

ComponentWriterAspect.addRuntime(ComponentWriterMain);

export default ComponentWriterMain;

export function incrementPathRecursively(p: string, allPaths: string[]) {
  const incrementPath = (str: string, number: number) => `${str}_${number}`;
  let num = 1;
  let newPath = incrementPath(p, num);
  while (allPaths.includes(newPath)) {
    newPath = incrementPath(p, (num += 1));
  }
  return newPath;
}
