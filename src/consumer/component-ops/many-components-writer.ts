import { BitError } from '@teambit/bit-error';
import fs from 'fs-extra';
import mapSeries from 'p-map-series';
import * as path from 'path';
import { BitId } from '../../bit-id';
import { COMPONENT_ORIGINS, DEFAULT_DIR_DEPENDENCIES } from '../../constants';
import GeneralError from '../../error/general-error';
import logger from '../../logger/logger';
import { ComponentWithDependencies } from '../../scope';
import { isDir, isDirEmptySync } from '../../utils';
import { composeComponentPath, composeDependencyPathForIsolated } from '../../utils/bit/compose-component-path';
import { PathLinuxRelative, pathNormalizeToLinux, PathOsBasedAbsolute, PathOsBasedRelative } from '../../utils/path';
import BitMap from '../bit-map';
import ComponentMap from '../bit-map/component-map';
import Component from '../component/consumer-component';
import DataToPersist from '../component/sources/data-to-persist';
import Consumer from '../consumer';
import ComponentWriter, { ComponentWriterProps } from './component-writer';
import { moveExistingComponent } from './move-components';

interface ExternalPackageInstaller {
  install: () => Promise<any>;
}

export interface ManyComponentsWriterParams {
  packageManager?: string;
  consumer?: Consumer;
  silentPackageManagerResult?: boolean;
  componentsWithDependencies: ComponentWithDependencies[];
  writeToPath?: string;
  override?: boolean;
  isolated?: boolean;
  writePackageJson?: boolean;
  saveDependenciesAsComponents?: boolean;
  writeConfig?: boolean;
  ignoreBitDependencies?: boolean;
  createNpmLinkFiles?: boolean;
  writeDists?: boolean;
  installNpmPackages?: boolean;
  installPeerDependencies?: boolean;
  addToRootPackageJson?: boolean;
  verbose?: boolean;
  installProdPackagesOnly?: boolean;
  excludeRegistryPrefix?: boolean;
  isLegacy?: boolean;
  applyPackageJsonTransformers?: boolean;
  resetConfig?: boolean;
}

/**
 * write the components into '/components' dir (or according to the bit.map) and its dependencies in the
 * '/components/.dependencies' dir. Both directories are configurable in bit.json
 * For example: global/a has a dependency my-scope/global/b@1. The directories will be:
 * project/root/components/global/a/impl.js
 * project/root/components/.dependencies/global/b/my-scope/1/impl.js
 *
 * In case there are some same dependencies shared between the components, it makes sure to
 * write them only once.
 */
export default class ManyComponentsWriter {
  consumer?: Consumer;
  silentPackageManagerResult?: boolean;
  componentsWithDependencies: ComponentWithDependencies[];
  writeToPath?: string;
  override: boolean;
  writePackageJson: boolean;
  writeConfig: boolean;
  ignoreBitDependencies: boolean | undefined;
  createNpmLinkFiles: boolean;
  writeDists: boolean;
  installNpmPackages: boolean;
  installPeerDependencies: boolean;
  addToRootPackageJson: boolean;
  verbose: boolean; // prints npm results
  excludeRegistryPrefix: boolean;
  installProdPackagesOnly?: boolean;
  dependenciesIdsCache: Record<string, any>;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  writtenComponents: Component[];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  writtenDependencies: Component[];
  isolated: boolean; // a preparation for the capsule feature
  bitMap: BitMap;
  basePath?: string;
  packageManager?: string;
  isLegacy?: boolean;
  applyPackageJsonTransformers?: boolean;
  resetConfig?: boolean;
  // Apply config added by extensions

  constructor(params: ManyComponentsWriterParams) {
    this.consumer = params.consumer;
    this.silentPackageManagerResult = params.silentPackageManagerResult;
    this.componentsWithDependencies = params.componentsWithDependencies;
    this.writeToPath = params.writeToPath;
    this.override = this._setBooleanDefault(params.override, true);
    this.isolated = this._setBooleanDefault(params.isolated, false);
    this.writePackageJson = this._setBooleanDefault(params.writePackageJson, true);
    this.writeConfig = this._setBooleanDefault(params.writeConfig, false);
    this.ignoreBitDependencies = params.ignoreBitDependencies;
    this.createNpmLinkFiles = this._setBooleanDefault(params.createNpmLinkFiles, false);
    this.writeDists = this._setBooleanDefault(params.writeDists, true);
    this.installPeerDependencies = this._setBooleanDefault(params.installPeerDependencies, false);
    this.installNpmPackages = this._setBooleanDefault(params.installNpmPackages, true);
    this.addToRootPackageJson = this._setBooleanDefault(params.addToRootPackageJson, true);
    this.verbose = this._setBooleanDefault(params.verbose, false);
    this.installProdPackagesOnly = this._setBooleanDefault(params.installProdPackagesOnly, false);
    this.excludeRegistryPrefix = this._setBooleanDefault(params.excludeRegistryPrefix, false);
    this.dependenciesIdsCache = {};
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.bitMap = this.consumer ? this.consumer.bitMap : new BitMap();
    this.packageManager = params.packageManager;
    this.isLegacy = this.consumer ? this.consumer.isLegacy : params.isLegacy;
    this.applyPackageJsonTransformers = params.applyPackageJsonTransformers ?? true;
    this.resetConfig = params.resetConfig;
    if (this.consumer && !this.isolated) this.basePath = this.consumer.getPath();
  }

  static externalInstaller: ExternalPackageInstaller;
  static externalCompiler: (ids?: BitId[]) => Promise<any>;
  static registerExternalInstaller(installer: ExternalPackageInstaller) {
    this.externalInstaller = installer;
  }

  _setBooleanDefault(field: boolean | null | undefined, defaultValue: boolean): boolean {
    return typeof field === 'undefined' ? defaultValue : Boolean(field);
  }
  async writeAll() {
    await this._writeComponentsAndDependencies();
    await this._installPackages();
    logger.debug('ManyComponentsWriter, Done!');
  }
  async _writeComponentsAndDependencies() {
    logger.debug('ManyComponentsWriter, _writeComponentsAndDependencies');
    await this._populateComponentsFilesToWrite();
    this._moveComponentsIfNeeded();
    await this._persistComponentsData();
  }
  async _installPackages() {
    logger.debug('ManyComponentsWriter, _installPackages');
    if (!this.installNpmPackages) {
      return;
    }
    try {
      await ManyComponentsWriter.externalInstaller?.install();
    } catch (err: any) {
      logger.error('_installPackagesIfNeeded, external package-installer found an error', err);
      throw new BitError(`failed installing the packages, consider running the command with "--skip-dependency-installation" flag.
error from the package-manager: ${err.message}.
please use the '--log=error' flag for the full error.`);
    }
    // this compiles all components on the workspace, not only the imported ones.
    // reason being is that the installed above deletes all dists dir of components that are somehow part of the
    // dependency graph. not only the imported components.
    await ManyComponentsWriter.externalCompiler?.();
  }
  async _persistComponentsData() {
    const dataToPersist = new DataToPersist();
    this.componentsWithDependencies.forEach((componentWithDeps) => {
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
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    dataToPersist.addBasePath(this.basePath);
    await dataToPersist.persistAllToFS();
  }

  async _populateComponentsFilesToWrite() {
    const writeComponentsParams = this._getWriteComponentsParams();
    const componentWriterInstances = writeComponentsParams.map((writeParams) =>
      ComponentWriter.getInstance(writeParams)
    );
    this.fixDirsIfNested(componentWriterInstances);
    // add componentMap entries into .bitmap before starting the process because steps like writing package-json
    // rely on .bitmap to determine whether a dependency exists and what's its origin
    componentWriterInstances.forEach((componentWriter: ComponentWriter) => {
      componentWriter.existingComponentMap =
        componentWriter.existingComponentMap || componentWriter.addComponentToBitMap(componentWriter.writeToPath);
    });
    if (this.resetConfig) {
      componentWriterInstances.forEach((componentWriter: ComponentWriter) => {
        delete componentWriter.existingComponentMap?.config;
      });
    }
    this.writtenComponents = await mapSeries(componentWriterInstances, (componentWriter: ComponentWriter) =>
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
    const existingRootDirs = Object.keys(this.bitMap.getAllTrackDirs());
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

  _getWriteComponentsParams(): ComponentWriterProps[] {
    return this.componentsWithDependencies.map((componentWithDeps: ComponentWithDependencies) =>
      this._getWriteParamsOfOneComponent(componentWithDeps)
    );
  }
  _getWriteParamsOfOneComponent(componentWithDeps: ComponentWithDependencies): ComponentWriterProps {
    // for isolated components, the component files should be on the root. see #1758
    const componentRootDir: PathLinuxRelative = this.isolated
      ? '.'
      : this._getComponentRootDir(componentWithDeps.component.id);
    const getParams = () => {
      if (!this.consumer) {
        return {
          origin: COMPONENT_ORIGINS.IMPORTED,
        };
      }
      // AUTHORED and IMPORTED components can't be saved with multiple versions, so we can ignore the version to
      // find the component in bit.map
      const componentMap = this.bitMap.getComponentPreferNonNested(componentWithDeps.component.id);
      const origin =
        componentMap && componentMap.origin === COMPONENT_ORIGINS.AUTHORED
          ? COMPONENT_ORIGINS.AUTHORED
          : COMPONENT_ORIGINS.IMPORTED;
      // $FlowFixMe consumer is set here
      this._throwErrorWhenDirectoryNotEmpty(this.consumer.toAbsolutePath(componentRootDir), componentMap);
      return {
        origin,
        existingComponentMap: componentMap,
      };
    };
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return {
      ...this._getDefaultWriteParams(),
      component: componentWithDeps.component,
      writeToPath: componentRootDir,
      writeConfig: this.writeConfig,
      ignoreBitDependencies:
        typeof this.ignoreBitDependencies === 'boolean'
          ? this.ignoreBitDependencies
          : componentWithDeps.component.dependenciesSavedAsComponents, // when dependencies are written as npm packages, they must be written in package.json
      ...getParams(),
    };
  }
  _getDefaultWriteParams(): Record<string, any> {
    return {
      writePackageJson: this.writePackageJson,
      applyPackageJsonTransformers: this.applyPackageJsonTransformers,
      consumer: this.consumer,
      bitMap: this.bitMap,
      isolated: this.isolated,
      excludeRegistryPrefix: this.excludeRegistryPrefix,
    };
  }
  _moveComponentsIfNeeded() {
    if (this.writeToPath && this.consumer) {
      this.componentsWithDependencies.forEach((componentWithDeps) => {
        // @ts-ignore componentWithDeps.component.componentMap is set
        const componentMap: ComponentMap = componentWithDeps.component.componentMap;
        if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED && !componentMap.rootDir) {
          throw new GeneralError(`unable to use "--path" flag.
to move individual files, use bit move.
to move all component files to a different directory, run bit remove and then bit import --path`);
        }
        const relativeWrittenPath = componentWithDeps.component.writtenPath;
        // @ts-ignore relativeWrittenPath is set at this point
        const absoluteWrittenPath = this.consumer.toAbsolutePath(relativeWrittenPath);
        // @ts-ignore this.writeToPath is set at this point
        const absoluteWriteToPath = path.resolve(this.writeToPath); // don't use consumer.toAbsolutePath, it might be an inner dir
        if (relativeWrittenPath && absoluteWrittenPath !== absoluteWriteToPath) {
          const component = componentWithDeps.component;
          // @ts-ignore consumer is set here
          moveExistingComponent(this.consumer, component, absoluteWrittenPath, absoluteWriteToPath);
        }
      });
    }
  }
  _getComponentRootDir(bitId: BitId): PathLinuxRelative {
    if (this.consumer) {
      return this.writeToPath
        ? pathNormalizeToLinux(this.consumer.getPathRelativeToConsumer(path.resolve(this.writeToPath)))
        : this.consumer.composeRelativeComponentPath(bitId);
    }
    return composeComponentPath(bitId);
  }
  _getDependencyRootDir(bitId: BitId): PathOsBasedRelative {
    if (this.isolated) {
      return composeDependencyPathForIsolated(bitId, DEFAULT_DIR_DEPENDENCIES);
    }
    // @ts-ignore consumer is set here
    return this.consumer.composeRelativeDependencyPath(bitId);
  }
  _throwErrorWhenDirectoryNotEmpty(componentDir: PathOsBasedAbsolute, componentMap: ComponentMap | null | undefined) {
    // if not writeToPath specified, it goes to the default directory. When componentMap exists, the
    // component is not new, and it's ok to override the existing directory.
    if (!this.writeToPath && componentMap) return;
    // if writeToPath specified and that directory is already used for that component, it's ok to override
    if (this.writeToPath && componentMap && componentMap.rootDir && componentMap.rootDir === this.writeToPath) return;

    if (fs.pathExistsSync(componentDir)) {
      if (!isDir(componentDir)) {
        throw new GeneralError(`unable to import to ${componentDir} because it's a file`);
      }
      if (!isDirEmptySync(componentDir) && !this.override) {
        throw new GeneralError(
          `unable to import to ${componentDir}, the directory is not empty. use --override flag to delete the directory and then import`
        );
      }
    }
  }
}
