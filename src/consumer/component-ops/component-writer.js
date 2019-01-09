// @flow
import fs from 'fs-extra';
import path from 'path';
import type Component from '../component/consumer-component';
import ComponentMap from '../bit-map/component-map';
import { BitId } from '../../bit-id';
import type { Consumer } from '..';
import logger from '../../logger/logger';
import GeneralError from '../../error/general-error';
import { pathNormalizeToLinux } from '../../utils/path';
import { COMPONENT_ORIGINS, PACKAGE_JSON } from '../../constants';
import mkdirp from '../../utils/mkdirp';
import getNodeModulesPathOfComponent from '../../utils/component-node-modules-path';
import type { PathOsBasedAbsolute, PathOsBasedRelative } from '../../utils/path';
import { AbstractVinyl } from '../../consumer/component/sources';
import { preparePackageJsonToWrite } from '../component/package-json';
import Symlink from '../../links/symlink';
import GeneralFile from '../component/sources/general-file';
import DataToPersist from '../component/sources/data-to-persist';

export type ComponentWriterProps = {
  component: Component,
  writeToPath: PathOsBasedAbsolute,
  writeConfig?: boolean,
  configDir?: string,
  writePackageJson?: boolean,
  override?: boolean,
  origin?: string,
  parent?: BitId,
  consumer?: Consumer,
  writeBitDependencies?: boolean,
  deleteBitDirContent?: boolean,
  existingComponentMap?: ComponentMap,
  excludeRegistryPrefix?: boolean
};

export default class ComponentWriter {
  component: Component;
  writeToPath: PathOsBasedRelative;
  writeConfig: boolean;
  configDir: ?string;
  writePackageJson: boolean;
  override: boolean;
  origin: ?string;
  parent: ?BitId;
  consumer: Consumer;
  writeBitDependencies: boolean;
  deleteBitDirContent: ?boolean;
  componentMap: ComponentMap;
  existingComponentMap: ?ComponentMap;
  excludeRegistryPrefix: boolean;
  files: AbstractVinyl[] = [];
  symlinks: Symlink[] = [];
  constructor({
    component,
    writeToPath,
    writeConfig = false,
    configDir,
    writePackageJson = true,
    override = true,
    origin,
    parent,
    consumer,
    writeBitDependencies = false,
    deleteBitDirContent,
    existingComponentMap,
    excludeRegistryPrefix = false
  }: ComponentWriterProps) {
    this.component = component;
    this.writeToPath = writeToPath;
    this.writeConfig = writeConfig;
    this.configDir = configDir;
    this.writePackageJson = writePackageJson;
    this.override = override;
    this.origin = origin;
    this.parent = parent;
    this.consumer = consumer;
    this.writeBitDependencies = writeBitDependencies;
    this.deleteBitDirContent = deleteBitDirContent;
    this.existingComponentMap = existingComponentMap;
    this.excludeRegistryPrefix = excludeRegistryPrefix;
  }

  static getInstance(componentWriterProps: ComponentWriterProps): ComponentWriter {
    return new ComponentWriter(componentWriterProps);
  }

  /**
   * write the component to the filesystem and update .bitmap with the details.
   *
   * bitMap gets updated before writing the files to the filesystem, because as part of writing the
   * package-json file, the componentMap is needed to be stored with the updated version.
   *
   * when a component is not new, write the files according to the paths in .bitmap.
   */
  async write(): Promise<Component> {
    logger.debug(`component-writer.write, id: ${this.component.id.toString()}`);
    if (!this.component.files || !this.component.files.length) {
      throw new GeneralError(`Component ${this.component.id.toString()} is invalid as it has no files`);
    }
    this._updateFilesBasePaths();
    this.componentMap = this.existingComponentMap || this.addComponentToBitMap(this.writeToPath);
    this.component.componentMap = this.componentMap;
    this._copyFilesIntoDistsWhenDistsOutsideComponentDir();
    this._determineWhetherToDeleteComponentDirContent();
    await this._handlePreviouslyNestedCurrentlyImportedCase();
    this._determineWhetherToWriteConfig();
    this._updateComponentRootPathAccordingToBitMap();
    this._updateBitMapIfNeeded();
    this._determineWhetherToWritePackageJson();
    await this._writeToComponentDir();

    return this.component;
  }

  async populateComponentsFilesToWrite(): Promise<Object> {
    if (!this.component.files || !this.component.files.length) {
      throw new GeneralError(`Component ${this.component.id.toString()} is invalid as it has no files`);
    }
    this.component.dataToPersist = DataToPersist.makeInstance({ files: this.files, symlinks: this.symlinks });
    this._updateFilesBasePaths();
    this.componentMap = this.existingComponentMap || this.addComponentToBitMap(this.writeToPath);
    this.component.componentMap = this.componentMap;
    this._copyFilesIntoDistsWhenDistsOutsideComponentDir();
    this._determineWhetherToDeleteComponentDirContent();
    await this._handlePreviouslyNestedCurrentlyImportedCase();
    this._determineWhetherToWriteConfig();
    this._updateComponentRootPathAccordingToBitMap();
    this._updateBitMapIfNeeded();
    this._determineWhetherToWritePackageJson();
    await this.populateFilesToWriteToComponentDir();
    return this.component;
  }

  async populateFilesToWriteToComponentDir() {
    this.files.push(...this.component.files);
    const dists = await this.component.dists.getDistsToWrite(this.component, this.consumer, false);
    if (dists) {
      this.files.push(...dists.files);
      this.symlinks.push(...dists.symlinks);
    }
    if (this.writeConfig && this.consumer) {
      // @todo: this currently writes the files directly, it won't be relevant later on.
      const resolvedConfigDir = this.configDir || this.consumer.dirStructure.ejectedEnvsDirStructure;
      await this.component.writeConfig(this.consumer, resolvedConfigDir, this.override);
    }
    // make sure the project's package.json is not overridden by Bit
    // If a consumer is of isolated env it's ok to override the root package.json (used by the env installation
    // of compilers / testers / extensions)
    if (this.writePackageJson && (this.consumer.isolated || this.writeToPath !== this.consumer.getPath())) {
      const packageJson = await preparePackageJsonToWrite(
        this.consumer,
        this.component,
        this.writeToPath,
        this.override,
        this.writeBitDependencies,
        this.excludeRegistryPrefix
      );
      const packageJsonPath = path.join(this.writeToPath, PACKAGE_JSON);
      const packageJsonContent = JSON.stringify(packageJson, null, 4);
      this.files.push(GeneralFile.load({ base: this.writeToPath, path: packageJsonPath, content: packageJsonContent }));
    }
    if (this.component.license && this.component.license.src) {
      this.component.license.override = this.override;
      this.files.push(this.component.license);
    }
  }

  async _writeToComponentDir() {
    if (this.deleteBitDirContent) {
      logger.info(`consumer-component._writeToComponentDir, deleting ${this.writeToPath}`);
      await fs.emptyDir(this.writeToPath);
    } else {
      await mkdirp(this.writeToPath);
    }
    if (this.component.files) await Promise.all(this.component.files.map(file => file.write(undefined, this.override)));
    await this.component.dists.writeDists(this.component, this.consumer, false);
    if (this.writeConfig && this.consumer) {
      const resolvedConfigDir = this.configDir || this.consumer.dirStructure.ejectedEnvsDirStructure;
      await this.component.writeConfig(this.consumer, resolvedConfigDir, this.override);
    }
    // make sure the project's package.json is not overridden by Bit
    // If a consumer is of isolated env it's ok to override the root package.json (used by the env installation
    // of compilers / testers / extensions)
    if (this.writePackageJson && (this.consumer.isolated || this.writeToPath !== this.consumer.getPath())) {
      await this.component.writePackageJson(
        this.consumer,
        this.writeToPath,
        this.override,
        this.writeBitDependencies,
        this.excludeRegistryPrefix
      );
    }
    if (this.component.license && this.component.license.src) {
      await this.component.license.write(this.writeToPath, this.override);
    }
    logger.debug('component has been written successfully');
    return this;
  }

  addComponentToBitMap(rootDir: ?string): ComponentMap {
    const filesForBitMap = this.component.files.map((file) => {
      return { name: file.basename, relativePath: pathNormalizeToLinux(file.relative), test: file.test };
    });
    const getConfigDir = () => {
      if (this.configDir) return this.configDir;
      if (this.componentMap) return this.componentMap.configDir;
      return undefined;
    };

    return this.consumer.bitMap.addComponent({
      componentId: this.component.id,
      files: filesForBitMap,
      mainFile: this.component.mainFile,
      rootDir,
      configDir: getConfigDir(),
      detachedCompiler: this.component.detachedCompiler,
      detachedTester: this.component.detachedTester,
      origin: this.origin,
      parent: this.parent,
      originallySharedDir: this.component.originallySharedDir,
      wrapDir: this.component.wrapDir
    });
  }

  _copyFilesIntoDistsWhenDistsOutsideComponentDir() {
    if (!this.consumer.shouldDistsBeInsideTheComponent() && this.component.dists.isEmpty()) {
      // since the dists are set to be outside the components dir, the source files must be saved there
      // otherwise, other components in dists won't be able to link to this component
      this.component.copyFilesIntoDists();
    }
  }

  _updateComponentRootPathAccordingToBitMap() {
    this.writeToPath = this.componentMap.rootDir || '.';
    this.component.writtenPath = this.writeToPath;
    this._updateFilesBasePaths();
  }

  /**
   * when there is componentMap, this component (with this version or other version) is already part of the project.
   * There are several options as to what was the origin before and what is the origin now and according to this,
   * we update/remove/don't-touch the record in bit.map.
   * 1) current origin is AUTHORED - If the version is the same as before, don't update bit.map. Otherwise, update.
   * 2) current origin is IMPORTED - If the version is the same as before, don't update bit.map. Otherwise, update.
   * one exception is where the origin was NESTED before, in this case, remove the current record and add a new one.
   * this case has been already handled before by this._handlePreviouslyNestedCurrentlyImportedCase();
   * 3) current origin is NESTED - the version can't be the same as before (otherwise it would be ignored before and
   * never reach this function, see @write-components.writeToComponentsDir). Therefore, always add to bit.map.
   */
  _updateBitMapIfNeeded() {
    const componentMapExistWithSameVersion = this.consumer.bitMap.isExistWithSameVersion(this.component.id);
    const updateBitMap =
      !componentMapExistWithSameVersion || this.componentMap.originallySharedDir !== this.component.originallySharedDir;
    if (updateBitMap) {
      if (componentMapExistWithSameVersion) {
        // originallySharedDir has been changed. it affects also the relativePath of the files
        // so it's better to just remove the old record and add a new one
        this.consumer.bitMap.removeComponent(this.component.id);
      }
      this.addComponentToBitMap(this.componentMap.rootDir);
    }
  }

  _determineWhetherToWriteConfig() {
    if (this.componentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
      this.writeConfig = false;
    }
  }

  /**
   * don't write the package.json for an authored component, because its dependencies are managed
   * by the root package.json
   */
  _determineWhetherToWritePackageJson() {
    this.writePackageJson = this.writePackageJson && this.origin !== COMPONENT_ORIGINS.AUTHORED;
  }

  /**
   * when a user imports a component that was a dependency before, write the component directly
   * into the components directory for an easy access/change. Then, remove the current record from
   * bit.map and add an updated one.
   */
  async _handlePreviouslyNestedCurrentlyImportedCase() {
    if (this.origin === COMPONENT_ORIGINS.IMPORTED && this.componentMap.origin === COMPONENT_ORIGINS.NESTED) {
      await this._cleanOldNestedComponent();
      this.componentMap = this.addComponentToBitMap(this.writeToPath);
    }
  }

  /**
   * For IMPORTED component we have to delete the content of the directory before importing.
   * Otherwise, when the author adds new files outside of the previous originallySharedDir and this user imports them
   * the environment will contain both copies, the old one with the old originallySharedDir and the new one.
   * If a user made changes to the imported component, it will show a warning and stop the process.
   */
  _determineWhetherToDeleteComponentDirContent() {
    if (typeof this.deleteBitDirContent === 'undefined') {
      this.deleteBitDirContent = this.origin === COMPONENT_ORIGINS.IMPORTED;
    }
  }

  _updateFilesBasePaths() {
    // const newBase = this.consumer ? this.consumer.toAbsolutePath(this.writeToPath) : '/';
    const newBase = this.writeToPath;
    this.component.files.forEach(file => file.updatePaths({ newBase }));
    if (!this.component.dists.isEmpty()) {
      this.component.dists.get().forEach(dist => dist.updatePaths({ newBase }));
    }
  }

  async _cleanOldNestedComponent() {
    // $FlowFixMe this function gets called when it was previously NESTED, so the rootDir is set
    const oldLocation = path.join(this.consumer.getPath(), this.componentMap.rootDir);
    logger.debug(`deleting the old directory of a component at ${oldLocation}`);
    await fs.remove(oldLocation);
    await this._removeNodeModulesLinksFromDependents();
    this.consumer.bitMap.removeComponent(this.component.id);
  }

  async _removeNodeModulesLinksFromDependents() {
    const directDependentComponents = await this.consumer.getAuthoredAndImportedDependentsOfComponents([
      this.component
    ]);
    await Promise.all(
      directDependentComponents.map((dependent) => {
        const dependentComponentMap = this.consumer.bitMap.getComponent(dependent.id);
        const relativeLinkPath = getNodeModulesPathOfComponent(this.consumer.bitJson.bindingPrefix, this.component.id);
        const nodeModulesLinkAbs = this.consumer.toAbsolutePath(
          path.join(dependentComponentMap.rootDir || '.', relativeLinkPath)
        );
        logger.debug(`deleting an obsolete link to node_modules at ${nodeModulesLinkAbs}`);
        return fs.remove(nodeModulesLinkAbs);
      })
    );
  }
}
