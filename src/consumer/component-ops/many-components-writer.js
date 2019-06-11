// @flow
import path from 'path';
import R from 'ramda';
import fs from 'fs-extra';
import pMapSeries from 'p-map-series';
import { moveExistingComponent } from './move-components';
import { getAllComponentsLinks } from '../../links';
import { installNpmPackagesForComponents } from '../../npm-client/install-packages';
import * as packageJsonUtils from '../component/package-json-utils';
import type { ComponentWithDependencies } from '../../scope';
import type Component from '../component/consumer-component';
import { COMPONENT_ORIGINS } from '../../constants';
import logger from '../../logger/logger';
import type Consumer from '../consumer';
import { isDir, isDirEmptySync } from '../../utils';
import GeneralError from '../../error/general-error';
import type ComponentMap from '../bit-map/component-map';
import ComponentWriter from './component-writer';
import type { ComponentWriterProps } from './component-writer';
import type { PathOsBasedAbsolute, PathOsBasedRelative } from '../../utils/path';
import DataToPersist from '../component/sources/data-to-persist';
import BitMap from '../bit-map';
import { composeComponentPath, composeDependencyPathForIsolated } from '../../utils/bit/compose-component-path';
import { BitId } from '../../bit-id';

type ManyComponentsWriterParams = {
  consumer?: ?Consumer,
  silentPackageManagerResult?: boolean,
  componentsWithDependencies: ComponentWithDependencies[],
  writeToPath?: string,
  override?: boolean,
  isolated?: boolean,
  writePackageJson?: boolean,
  writeConfig?: boolean,
  configDir?: string,
  writeBitDependencies?: boolean,
  createNpmLinkFiles?: boolean,
  writeDists?: boolean,
  installNpmPackages?: boolean,
  installPeerDependencies?: boolean,
  addToRootPackageJson?: boolean,
  verbose?: boolean,
  excludeRegistryPrefix?: boolean
};

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
  consumer: ?Consumer;
  silentPackageManagerResult: ?boolean;
  componentsWithDependencies: ComponentWithDependencies[];
  writeToPath: ?string;
  override: boolean;
  isolated: boolean;
  writePackageJson: boolean;
  writeConfig: boolean;
  configDir: ?string;
  writeBitDependencies: boolean;
  createNpmLinkFiles: boolean;
  writeDists: boolean;
  installNpmPackages: boolean;
  installPeerDependencies: boolean;
  addToRootPackageJson: boolean;
  verbose: boolean;
  excludeRegistryPrefix: boolean;
  dependenciesIdsCache: Object;
  writtenComponents: Component[];
  writtenDependencies: Component[];
  isolated: boolean; // a preparation for the capsule feature
  bitMap: BitMap;
  basePath: ?string;
  constructor(params: ManyComponentsWriterParams) {
    this.consumer = params.consumer;
    this.silentPackageManagerResult = params.silentPackageManagerResult;
    this.componentsWithDependencies = params.componentsWithDependencies;
    this.writeToPath = params.writeToPath;
    this.override = this._setBooleanDefault(params.override, true);
    this.isolated = this._setBooleanDefault(params.isolated, false);
    this.writePackageJson = this._setBooleanDefault(params.writePackageJson, true);
    this.writeConfig = this._setBooleanDefault(params.writeConfig, false);
    this.configDir = params.configDir;
    this.writeBitDependencies = this._setBooleanDefault(params.writeBitDependencies, false);
    this.createNpmLinkFiles = this._setBooleanDefault(params.createNpmLinkFiles, false);
    this.writeDists = this._setBooleanDefault(params.writeDists, true);
    this.installPeerDependencies = this._setBooleanDefault(params.installPeerDependencies, false);
    this.installNpmPackages = this._setBooleanDefault(params.installNpmPackages, true);
    this.addToRootPackageJson = this._setBooleanDefault(params.addToRootPackageJson, true);
    this.verbose = this._setBooleanDefault(params.verbose, false);
    this.excludeRegistryPrefix = this._setBooleanDefault(params.excludeRegistryPrefix, false);
    this.dependenciesIdsCache = {};
    this.bitMap = this.consumer ? this.consumer.bitMap : new BitMap();
    if (this.consumer && !this.isolated) this.basePath = this.consumer.getPath();
  }
  _setBooleanDefault(field: ?boolean, defaultValue: boolean): boolean {
    return typeof field === 'undefined' ? defaultValue : Boolean(field);
  }
  async writeAll() {
    await this._writeComponentsAndDependencies();
    await this._installPackages();
    await this._writeLinks();
    logger.debug('ManyComponentsWriter, Done!');
  }
  async _writeComponentsAndDependencies() {
    logger.debug('ManyComponentsWriter, _writeComponentsAndDependencies');
    await this._populateComponentsFilesToWrite();
    await this._populateComponentsDependenciesToWrite();
    this._moveComponentsIfNeeded();
    this._addBasePathIfExistToAllFiles();
    await this._persistComponentsData();
  }
  async _installPackages() {
    logger.debug('ManyComponentsWriter, _installPackages');
    if (this.consumer) {
      await packageJsonUtils.addWorkspacesToPackageJson(this.consumer, this.writeToPath);
      if (this.addToRootPackageJson && this.consumer) {
        await packageJsonUtils.addComponentsToRoot(this.consumer, this.writtenComponents);
      }
    }
    await this._installPackagesIfNeeded();
  }
  async _writeLinks() {
    logger.debug('ManyComponentsWriter, _writeLinks');
    const links: DataToPersist = await this._getAllLinks();
    if (this.basePath) {
      links.addBasePath(this.basePath);
    }
    await links.persistAllToFS();
  }
  async _persistComponentsData() {
    const dataToPersist = new DataToPersist();
    this.componentsWithDependencies.forEach((componentWithDeps) => {
      const allComponents = [componentWithDeps.component, ...componentWithDeps.allDependencies];
      allComponents.forEach(component => dataToPersist.merge(component.dataToPersist));
    });
    if (this.consumer && this.consumer.config.overrides.hasChanged) {
      const jsonFiles = await this.consumer.config.prepareToWrite({ bitDir: this.consumer.getPath() });
      dataToPersist.addManyFiles(jsonFiles);
    }
    await dataToPersist.persistAllToFS();
  }
  _addBasePathIfExistToAllFiles() {
    if (!this.basePath) return;
    this.componentsWithDependencies.forEach((componentWithDeps) => {
      const allComponents = [componentWithDeps.component, ...componentWithDeps.allDependencies];
      allComponents.forEach((component) => {
        // $FlowFixMe
        if (component.dataToPersist) component.dataToPersist.addBasePath(this.basePath);
      });
    });
  }
  async _populateComponentsFilesToWrite() {
    const writeComponentsParams = this._getWriteComponentsParams();
    const componentWriterInstances = writeComponentsParams.map(writeParams => ComponentWriter.getInstance(writeParams));
    // add componentMap entries into .bitmap before starting the process because steps like writing package-json
    // rely on .bitmap to determine whether a dependency exists and what's its origin
    componentWriterInstances.forEach((componentWriter) => {
      componentWriter.existingComponentMap =
        componentWriter.existingComponentMap || componentWriter.addComponentToBitMap(componentWriter.writeToPath);
    });
    this.writtenComponents = await pMapSeries(componentWriterInstances, componentWriter =>
      componentWriter.populateComponentsFilesToWrite()
    );
  }
  _getWriteComponentsParams(): ComponentWriterProps[] {
    return this.componentsWithDependencies.map((componentWithDeps: ComponentWithDependencies) =>
      this._getWriteParamsOfOneComponent(componentWithDeps)
    );
  }
  _getWriteParamsOfOneComponent(componentWithDeps: ComponentWithDependencies): ComponentWriterProps {
    const componentRootDir: PathOsBasedRelative = this._getComponentRootDir(componentWithDeps.component.id);
    const getParams = () => {
      if (!this.consumer) {
        return {
          origin: COMPONENT_ORIGINS.IMPORTED
        };
      }
      // AUTHORED and IMPORTED components can't be saved with multiple versions, so we can ignore the version to
      // find the component in bit.map
      const componentMap = this.bitMap.getComponentPreferNonNested(componentWithDeps.component.id);
      const origin =
        componentMap && componentMap.origin === COMPONENT_ORIGINS.AUTHORED
          ? COMPONENT_ORIGINS.AUTHORED
          : COMPONENT_ORIGINS.IMPORTED;
      const configDirFromComponentMap = componentMap ? componentMap.configDir : undefined;
      // $FlowFixMe consumer is set here
      this._throwErrorWhenDirectoryNotEmpty(this.consumer.toAbsolutePath(componentRootDir), componentMap);
      // don't write dists files for authored components as the author has its own mechanism to generate them
      // also, don't write dists file for imported component, unless the user used '--dist' flag
      componentWithDeps.component.dists.writeDistsFiles = this.writeDists && origin === COMPONENT_ORIGINS.IMPORTED;
      return {
        configDir: this.configDir || configDirFromComponentMap,
        origin,
        existingComponentMap: componentMap
      };
    };
    return {
      ...this._getDefaultWriteParams(),
      component: componentWithDeps.component,
      writeToPath: componentRootDir,
      writeBitDependencies: this.writeBitDependencies || !componentWithDeps.component.dependenciesSavedAsComponents, // when dependencies are written as npm packages, they must be written in package.json
      ...getParams()
    };
  }
  _getDefaultWriteParams(): Object {
    return {
      writeConfig: this.writeConfig,
      writePackageJson: this.writePackageJson,
      consumer: this.consumer,
      bitMap: this.bitMap,
      isolated: this.isolated,
      excludeRegistryPrefix: this.excludeRegistryPrefix
    };
  }
  async _populateComponentsDependenciesToWrite() {
    const allDependenciesP = this.componentsWithDependencies.map((componentWithDeps: ComponentWithDependencies) => {
      const writeDependenciesP = componentWithDeps.allDependencies.map((dep: Component) => {
        const dependencyId = dep.id.toString();
        const depFromBitMap = this.bitMap.getComponentIfExist(dep.id);
        if (!dep.componentMap) dep.componentMap = depFromBitMap;
        if (!componentWithDeps.component.dependenciesSavedAsComponents && !depFromBitMap) {
          // when depFromBitMap is true, it means that this component was imported as a component already before
          // don't change it now from a component to a package. (a user can do it at any time by using export --eject).
          logger.debugAndAddBreadCrumb(
            'writeToComponentsDir',
            "ignore dependency {dependencyId}. It'll be installed later using npm-client",
            { dependencyId }
          );
          return Promise.resolve(null);
        }
        if (depFromBitMap && depFromBitMap.origin === COMPONENT_ORIGINS.AUTHORED) {
          dep.writtenPath = '.';
          logger.debugAndAddBreadCrumb(
            'writeToComponentsDir',
            'writeToComponentsDir, ignore dependency {dependencyId} as it already exists in bit map',
            { dependencyId }
          );
          return Promise.resolve(dep);
        }
        if (this.dependenciesIdsCache[dependencyId]) {
          logger.debugAndAddBreadCrumb(
            'writeToComponentsDir',
            'writeToComponentsDir, ignore dependency {dependencyId} as it already exists in cache',
            { dependencyId }
          );
          dep.writtenPath = this.dependenciesIdsCache[dependencyId];
          return Promise.resolve(dep);
        }
        const depRootPath = this._getDependencyRootDir(dep.id);
        dep.writtenPath = depRootPath;
        this.dependenciesIdsCache[dependencyId] = depRootPath;
        // When a component is NESTED we do interested in the exact version, because multiple components with the same scope
        // and namespace can co-exist with different versions.
        const componentMap = this.bitMap.getComponentIfExist(dep.id);
        const componentWriter = ComponentWriter.getInstance({
          ...this._getDefaultWriteParams(),
          writeConfig: false,
          component: dep,
          writeToPath: depRootPath,
          origin: COMPONENT_ORIGINS.NESTED,
          existingComponentMap: componentMap
        });
        return componentWriter.populateComponentsFilesToWrite();
      });

      return Promise.all(writeDependenciesP).then(deps => deps.filter(dep => dep));
    });
    const writtenDependenciesIncludesNull = await Promise.all(allDependenciesP);
    this.writtenDependencies = R.flatten(writtenDependenciesIncludesNull).filter(dep => dep);
  }
  _moveComponentsIfNeeded() {
    if (this.writeToPath && this.consumer) {
      this.componentsWithDependencies.forEach((componentWithDeps) => {
        const relativeWrittenPath = componentWithDeps.component.writtenPath;
        // $FlowFixMe relativeWrittenPath is set
        const absoluteWrittenPath = this.consumer.toAbsolutePath(relativeWrittenPath);
        // $FlowFixMe this.writeToPath is set
        const absoluteWriteToPath = path.resolve(this.writeToPath); // don't use consumer.toAbsolutePath, it might be an inner dir
        if (relativeWrittenPath && absoluteWrittenPath !== absoluteWriteToPath) {
          const component = componentWithDeps.component;
          // $FlowFixMe consumer is set here
          moveExistingComponent(this.consumer, component, absoluteWrittenPath, absoluteWriteToPath);
        }
      });
    }
  }
  async _installPackagesIfNeeded() {
    if (!this.installNpmPackages) return;
    await installNpmPackagesForComponents({
      // $FlowFixMe consumer is set here
      consumer: this.consumer,
      basePath: this.basePath,
      componentsWithDependencies: this.componentsWithDependencies,
      verbose: this.verbose, // $FlowFixMe
      silentPackageManagerResult: this.silentPackageManagerResult,
      installPeerDependencies: this.installPeerDependencies
    });
  }
  async _getAllLinks(): Promise<DataToPersist> {
    return getAllComponentsLinks({
      componentsWithDependencies: this.componentsWithDependencies,
      writtenComponents: this.writtenComponents,
      writtenDependencies: this.writtenDependencies,
      consumer: this.consumer,
      bitMap: this.bitMap,
      createNpmLinkFiles: this.createNpmLinkFiles,
      writePackageJson: this.writePackageJson
    });
  }
  _getComponentRootDir(bitId: BitId): PathOsBasedRelative {
    if (this.consumer) {
      return this.writeToPath
        ? this.consumer.getPathRelativeToConsumer(path.resolve(this.writeToPath))
        : this.consumer.composeRelativeComponentPath(bitId);
    }
    return composeComponentPath(bitId);
  }
  _getDependencyRootDir(bitId: BitId): PathOsBasedRelative {
    if (this.isolated) {
      return composeDependencyPathForIsolated(bitId);
    }
    // $FlowFixMe consumer is set here
    return this.consumer.composeRelativeDependencyPath(bitId);
  }
  _throwErrorWhenDirectoryNotEmpty(componentDir: PathOsBasedAbsolute, componentMap: ?ComponentMap) {
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
