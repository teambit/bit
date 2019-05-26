// @flow
import fs from 'fs-extra';
import * as RA from 'ramda-adjunct';
import path from 'path';
import type Component from '../component/consumer-component';
import ComponentMap from '../bit-map/component-map';
import type { ComponentOrigin } from '../bit-map/component-map';
import type Consumer from '../consumer';
import logger from '../../logger/logger';
import GeneralError from '../../error/general-error';
import { pathNormalizeToLinux } from '../../utils/path';
import { COMPONENT_ORIGINS, COMPILER_ENV_TYPE, TESTER_ENV_TYPE, DEFAULT_EJECTED_ENVS_DIR_PATH } from '../../constants';
import getNodeModulesPathOfComponent from '../../utils/bit/component-node-modules-path';
import type { PathOsBasedRelative } from '../../utils/path';
import { preparePackageJsonToWrite } from '../component/package-json-utils';
import DataToPersist from '../component/sources/data-to-persist';
import RemovePath from '../component/sources/remove-path';
import EnvExtension from '../../extensions/env-extension';
import ComponentConfig from '../config/component-config';
import { populateEnvFilesToWrite } from './eject-conf';

export type ComponentWriterProps = {
  component: Component,
  writeToPath: PathOsBasedRelative,
  writeConfig?: boolean,
  configDir?: string,
  writePackageJson?: boolean,
  override?: boolean,
  origin: ComponentOrigin,
  consumer: Consumer,
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
  origin: ComponentOrigin;
  consumer: Consumer;
  writeBitDependencies: boolean;
  deleteBitDirContent: ?boolean;
  componentMap: ComponentMap;
  existingComponentMap: ?ComponentMap;
  excludeRegistryPrefix: boolean;
  constructor({
    component,
    writeToPath,
    writeConfig = false,
    configDir,
    writePackageJson = true,
    override = true,
    origin,
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
    await this.populateComponentsFilesToWrite();
    this.component.dataToPersist.addBasePath(this.consumer.getPath());
    await this.component.dataToPersist.persistAllToFS();
    return this.component;
  }

  async populateComponentsFilesToWrite(): Promise<Object> {
    if (!this.component.files || !this.component.files.length) {
      throw new GeneralError(`Component ${this.component.id.toString()} is invalid as it has no files`);
    }
    this.component.dataToPersist = new DataToPersist();
    this._updateFilesBasePaths();
    this.componentMap = this.existingComponentMap || this.addComponentToBitMap(this.writeToPath);
    this.component.componentMap = this.componentMap;
    this._copyFilesIntoDistsWhenDistsOutsideComponentDir();
    this._determineWhetherToDeleteComponentDirContent();
    await this._handlePreviouslyNestedCurrentlyImportedCase();
    this._determineWhetherToWriteConfig();
    this._updateComponentRootPathAccordingToBitMap();
    this._updateBitMapIfNeeded();
    await this._updateConsumerConfigIfNeeded();
    this._determineWhetherToWritePackageJson();
    await this.populateFilesToWriteToComponentDir();
    return this.component;
  }

  async populateFilesToWriteToComponentDir() {
    if (this.deleteBitDirContent) {
      this.component.dataToPersist.removePath(new RemovePath(this.writeToPath));
    }
    this.component.files.forEach(file => (file.override = this.override));
    this.component.files.map(file => this.component.dataToPersist.addFile(file));
    const dists = await this.component.dists.getDistsToWrite(this.component, this.consumer, false);
    if (dists) this.component.dataToPersist.merge(dists);
    if (this.writeConfig && this.consumer) {
      const resolvedConfigDir = this.configDir || this.consumer.dirStructure.ejectedEnvsDirStructure;
      const configToWrite = await this.component.getConfigToWrite(this.consumer, resolvedConfigDir);
      this.component.dataToPersist.merge(configToWrite.dataToPersist);
    }
    // make sure the project's package.json is not overridden by Bit
    // If a consumer is of isolated env it's ok to override the root package.json (used by the env installation
    // of compilers / testers / extensions)
    if (this.writePackageJson && (this.consumer.isolated || this.writeToPath !== this.consumer.getPath())) {
      const { packageJson, distPackageJson } = preparePackageJsonToWrite(
        this.consumer,
        this.component,
        this.writeToPath,
        this.override,
        this.writeBitDependencies,
        this.excludeRegistryPrefix
      );

      const componentConfig = ComponentConfig.fromComponent(this.component);
      componentConfig.compiler = this.component.compiler ? this.component.compiler.toBitJsonObject('.') : {};
      componentConfig.tester = this.component.tester ? this.component.tester.toBitJsonObject('.') : {};
      packageJson.addOrUpdateProperty('bit', componentConfig.toPlainObject());
      await this._populateEnvFilesIfNeeded();
      this.component.dataToPersist.addFile(packageJson.toJSONFile());
      if (distPackageJson) this.component.dataToPersist.addFile(distPackageJson.toJSONFile());
      this.component.packageJsonFile = packageJson;
    }
    if (this.component.license && this.component.license.contents) {
      this.component.license.updatePaths({ newBase: this.writeToPath });
      // $FlowFixMe this.component.license is set
      this.component.license.override = this.override;
      // $FlowFixMe this.component.license is set
      this.component.dataToPersist.addFile(this.component.license);
    }
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
      mainFile: this.component.mainFile, // $FlowFixMe
      rootDir, // $FlowFixMe
      configDir: getConfigDir(),
      origin: this.origin,
      originallySharedDir: this.component.originallySharedDir,
      wrapDir: this.component.wrapDir
    });
  }

  async _populateEnvFilesIfNeeded() {
    const areThereEnvFiles =
      (this.component.compiler && !RA.isNilOrEmpty(this.component.compiler.files)) ||
      (this.component.tester && !RA.isNilOrEmpty(this.component.tester.files));
    if (!areThereEnvFiles) {
      return;
    }

    if (this.component.compiler) {
      await populateEnvFilesToWrite({
        configDir: this.writeToPath,
        env: this.component.compiler,
        consumer: this.consumer,
        component: this.component,
        deleteOldFiles: false,
        verbose: false
      });
      // $FlowFixMe
      this.component.dataToPersist.merge(this.component.compiler.dataToPersist);
    }
    if (this.component.tester) {
      await populateEnvFilesToWrite({
        configDir: this.writeToPath,
        env: this.component.tester,
        consumer: this.consumer,
        component: this.component,
        deleteOldFiles: false,
        verbose: false
      });
      // $FlowFixMe
      this.component.dataToPersist.merge(this.component.tester.dataToPersist);
    }
    if (!this.writeConfig && !this.configDir && this.component.componentMap) {
      this.configDir = DEFAULT_EJECTED_ENVS_DIR_PATH;
      this.component.componentMap.setConfigDir(this.configDir);
    }
  }

  _copyFilesIntoDistsWhenDistsOutsideComponentDir() {
    if (!this.consumer.shouldDistsBeInsideTheComponent() && this.component.dists.isEmpty()) {
      // since the dists are set to be outside the components dir, the source files must be saved there
      // otherwise, other components in dists won't be able to link to this component
      this.component.copyFilesIntoDists();
    }
  }

  _updateComponentRootPathAccordingToBitMap() {
    this.writeToPath = this.componentMap.getRootDir();
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
      this.component.componentMap = this.addComponentToBitMap(this.componentMap.rootDir);
    }
  }

  async _updateConsumerConfigIfNeeded() {
    // for authored components there is no bit.json/package.json component specific
    // so if the overrides or envs were changed, it should be written to the consumer-config
    const areEnvsChanged = async (): Promise<boolean> => {
      const context = { componentDir: this.componentMap.getRootDir() };
      const compilerFromConsumer = await this.consumer.getEnv(COMPILER_ENV_TYPE, context);
      const testerFromConsumer = await this.consumer.getEnv(TESTER_ENV_TYPE, context);
      const compilerFromComponent = this.component.compiler ? this.component.compiler.toModelObject() : null;
      const testerFromComponent = this.component.tester ? this.component.tester.toModelObject() : null;
      return (
        EnvExtension.areEnvsDifferent(
          compilerFromConsumer ? compilerFromConsumer.toModelObject() : null,
          compilerFromComponent
        ) ||
        EnvExtension.areEnvsDifferent(
          testerFromConsumer ? testerFromConsumer.toModelObject() : null,
          testerFromComponent
        )
      );
    };
    if (this.componentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
      this.consumer.config.overrides.updateOverridesIfChanged(this.component, await areEnvsChanged());
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
    const newBase = this.writeToPath || '.';
    this.component.files.forEach(file => file.updatePaths({ newBase }));
    if (!this.component.dists.isEmpty()) {
      this.component.dists.get().forEach(dist => dist.updatePaths({ newBase }));
    }
  }

  async _cleanOldNestedComponent() {
    // $FlowFixMe this function gets called when it was previously NESTED, so the rootDir is set
    const oldLocation = path.join(this.consumer.getPath(), this.componentMap.rootDir);
    logger.debugAndAddBreadCrumb(
      'component-writer._cleanOldNestedComponent',
      'deleting the old directory of a component at {oldLocation}',
      { oldLocation }
    );
    await fs.remove(oldLocation);
    await this._removeNodeModulesLinksFromDependents();
    this.consumer.bitMap.removeComponent(this.component.id);
  }

  async _removeNodeModulesLinksFromDependents() {
    const directDependentIds = await this.consumer.getAuthoredAndImportedDependentsIdsOf([this.component]);
    await Promise.all(
      directDependentIds.map((dependentId) => {
        const dependentComponentMap = this.consumer.bitMap.getComponent(dependentId);
        const relativeLinkPath = getNodeModulesPathOfComponent(this.consumer.config.bindingPrefix, this.component.id);
        const nodeModulesLinkAbs = this.consumer.toAbsolutePath(
          path.join(dependentComponentMap.getRootDir(), relativeLinkPath)
        );
        logger.debug(`deleting an obsolete link to node_modules at ${nodeModulesLinkAbs}`);
        return fs.remove(nodeModulesLinkAbs);
      })
    );
  }
}
