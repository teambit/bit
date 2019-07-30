// @flow
import R from 'ramda';
import fs from 'fs-extra';
import semver from 'semver';
import * as RA from 'ramda-adjunct';
import path from 'path';
import type Component from '../component/consumer-component';
import ComponentMap from '../bit-map/component-map';
import type { ComponentOrigin } from '../bit-map/component-map';
import type Consumer from '../consumer';
import logger from '../../logger/logger';
import GeneralError from '../../error/general-error';
import { pathNormalizeToLinux, getPathRelativeRegardlessCWD } from '../../utils/path';
import {
  COMPONENT_ORIGINS,
  COMPILER_ENV_TYPE,
  TESTER_ENV_TYPE,
  DEFAULT_EJECTED_ENVS_DIR_PATH,
  COMPONENT_DIST_PATH_TEMPLATE
} from '../../constants';
import getNodeModulesPathOfComponent from '../../utils/bit/component-node-modules-path';
import type { PathOsBasedRelative } from '../../utils/path';
import { preparePackageJsonToWrite } from '../component/package-json-utils';
import DataToPersist from '../component/sources/data-to-persist';
import RemovePath from '../component/sources/remove-path';
import BitMap from '../bit-map/bit-map';
import ConfigDir from '../bit-map/config-dir';
import EnvExtension from '../../extensions/env-extension';
import ComponentConfig from '../config/component-config';
import { populateEnvFilesToWrite } from './eject-conf';
import PackageJsonFile from '../component/package-json-file';

export type ComponentWriterProps = {
  component: Component,
  writeToPath: PathOsBasedRelative,
  writeConfig?: boolean,
  configDir?: string,
  writePackageJson?: boolean,
  override?: boolean,
  isolated?: boolean,
  origin: ComponentOrigin,
  consumer: ?Consumer,
  bitMap: BitMap,
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
  isolated: ?boolean;
  origin: ComponentOrigin;
  consumer: ?Consumer;
  bitMap: BitMap;
  writeBitDependencies: boolean;
  deleteBitDirContent: ?boolean;
  existingComponentMap: ?ComponentMap;
  excludeRegistryPrefix: boolean;
  constructor({
    component,
    writeToPath,
    writeConfig = false,
    configDir,
    writePackageJson = true,
    override = true,
    isolated = false,
    origin,
    consumer,
    bitMap,
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
    this.isolated = isolated;
    this.origin = origin;
    this.consumer = consumer;
    this.bitMap = bitMap;
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
    if (!this.consumer) throw new Error('ComponentWriter.write expect to have a consumer');
    await this.populateComponentsFilesToWrite();
    // $FlowFixMe consumer is set
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
    this.component.componentMap = this.existingComponentMap || this.addComponentToBitMap(this.writeToPath);
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
    const dists = await this.component.dists.getDistsToWrite(this.component, this.bitMap, this.consumer, false);
    if (dists) this.component.dataToPersist.merge(dists);
    if (this.writeConfig && this.consumer) {
      const resolvedConfigDir = this.configDir || this.consumer.dirStructure.ejectedEnvsDirStructure;
      const configToWrite = await this.component.getConfigToWrite(this.consumer, this.bitMap, resolvedConfigDir);
      this.component.dataToPersist.merge(configToWrite.dataToPersist);
    }
    // make sure the project's package.json is not overridden by Bit
    // If a consumer is of isolated env it's ok to override the root package.json (used by the env installation
    // of compilers / testers / extensions)
    if (
      this.writePackageJson &&
      (this.isolated || (this.consumer && this.consumer.isolated) || this.writeToPath !== '.')
    ) {
      const { packageJson, distPackageJson } = preparePackageJsonToWrite(
        this.consumer,
        this.component,
        this.writeToPath,
        this.override,
        this.writeBitDependencies,
        this.excludeRegistryPrefix
      );

      const componentConfig = ComponentConfig.fromComponent(this.component);
      // @todo: temporarily this is running only when there is no version (or version is "latest")
      // so then package.json always has a valid version. we'll need to figure out when the version
      // needs to be incremented and when it should not.
      if ((!this.consumer || this.consumer.isolated) && !this.component.id.hasVersion()) {
        // this only needs to be done in an isolated
        // or consumerless (dependency in an isolated) environment
        packageJson.addOrUpdateProperty('version', this._getNextPatchVersion());
      }

      componentConfig.compiler = this.component.compiler ? this.component.compiler.toBitJsonObject('.') : {};
      componentConfig.tester = this.component.tester ? this.component.tester.toBitJsonObject('.') : {};
      packageJson.addOrUpdateProperty('bit', componentConfig.toPlainObject());
      this._mergeChangedPackageJsonProps(packageJson);
      await this._populateEnvFilesIfNeeded();
      this.component.dataToPersist.addFile(packageJson.toVinylFile());
      if (distPackageJson) this.component.dataToPersist.addFile(distPackageJson.toVinylFile());
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
      if (this.component.componentMap) return this.component.componentMap.configDir;
      return undefined;
    };

    return this.bitMap.addComponent({
      componentId: this.component.id,
      files: filesForBitMap,
      mainFile: pathNormalizeToLinux(this.component.mainFile), // $FlowFixMe
      rootDir, // $FlowFixMe
      configDir: getConfigDir(),
      origin: this.origin,
      trackDir: this.existingComponentMap && this.existingComponentMap.trackDir,
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

  _mergeChangedPackageJsonProps(packageJson: PackageJsonFile) {
    if (!this.component.packageJsonChangedProps) return;
    const valuesToMerge = this._replaceDistPathTemplateWithCalculatedDistPath(packageJson);
    packageJson.mergePackageJsonObject(valuesToMerge);
  }

  /**
   * see https://github.com/teambit/bit/issues/1808 for more info why it's needed
   */
  _replaceDistPathTemplateWithCalculatedDistPath(packageJson: PackageJsonFile): Object {
    // $FlowFixMe
    const packageJsonChangedProps: Object = this.component.packageJsonChangedProps;
    const isReplaceNeeded = R.values(packageJsonChangedProps).some(val => val.includes(COMPONENT_DIST_PATH_TEMPLATE));
    if (!isReplaceNeeded) {
      return packageJsonChangedProps;
    }
    if (!this.component.dists || !this.component.dists.distsRootDir) {
      throw new Error(
        `package.json has a dynamic value ${COMPONENT_DIST_PATH_TEMPLATE}, however, the dist root is not set`
      );
    }
    const distRelativeToPackageJson = getPathRelativeRegardlessCWD(
      path.dirname(packageJson.filePath), // $FlowFixMe
      this.component.dists.distsRootDir
    );
    return Object.keys(packageJsonChangedProps).reduce((acc, key) => {
      const val = packageJsonChangedProps[key].replace(COMPONENT_DIST_PATH_TEMPLATE, distRelativeToPackageJson);
      acc[key] = val;
      return acc;
    }, {});
  }

  _copyFilesIntoDistsWhenDistsOutsideComponentDir() {
    if (!this.consumer) return; // not relevant when consumer is not available
    if (!this.consumer.shouldDistsBeInsideTheComponent() && this.component.dists.isEmpty()) {
      // since the dists are set to be outside the components dir, the source files must be saved there
      // otherwise, other components in dists won't be able to link to this component
      this.component.copyFilesIntoDists();
    }
  }

  _updateComponentRootPathAccordingToBitMap() {
    this.writeToPath = this.component.componentMap.getRootDir();
    this.component.writtenPath = this.writeToPath;
    this._updateFilesBasePaths();
  }

  /**
   * when there is componentMap, this component (with this version or other version) is already part of the project.
   * There are several options as to what was the origin before and what is the origin now and according to this,
   * we update/remove/don't-touch the record in bit.map.
   * 1) current origin is AUTHORED - If the version is the same as before, don't update bit.map. Otherwise, update.
   * 2) current origin is IMPORTED - If the version is the same as before, don't update bit.map. Otherwise, update.
   * 3) current origin is NESTED - the version can't be the same as before (otherwise it would be ignored before and
   * never reach this function, see @write-components.writeToComponentsDir). Therefore, always add to bit.map.
   */
  _updateBitMapIfNeeded() {
    if (this.isolated) return;
    const componentMapExistWithSameVersion = this.bitMap.isExistWithSameVersion(this.component.id);
    if (componentMapExistWithSameVersion) {
      this.bitMap.removeComponent(this.component.id);
    }
    this.component.componentMap = this.addComponentToBitMap(this.component.componentMap.rootDir);
  }

  async _updateConsumerConfigIfNeeded() {
    // for authored components there is no bit.json/package.json component specific
    // so if the overrides or envs were changed, it should be written to the consumer-config
    const areEnvsChanged = async (): Promise<boolean> => {
      const context = { componentDir: this.component.componentMap.getRootDir() };
      const compilerFromConsumer = this.consumer ? await this.consumer.getEnv(COMPILER_ENV_TYPE, context) : null;
      const testerFromConsumer = this.consumer ? await this.consumer.getEnv(TESTER_ENV_TYPE, context) : null;
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
    if (this.component.componentMap.origin === COMPONENT_ORIGINS.AUTHORED && this.consumer) {
      this.consumer.config.overrides.updateOverridesIfChanged(this.component, await areEnvsChanged());
    }
  }

  _determineWhetherToWriteConfig() {
    if (this.component.componentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
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
    if (!this.consumer) return;
    if (this.origin === COMPONENT_ORIGINS.IMPORTED && this.component.componentMap.origin === COMPONENT_ORIGINS.NESTED) {
      await this._cleanOldNestedComponent();
      this.component.componentMap = this.addComponentToBitMap(this.writeToPath);
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
    if (!this.consumer) throw new Error('ComponentWriter._cleanOldNestedComponent expect to have a consumer');
    // $FlowFixMe this function gets called when it was previously NESTED, so the rootDir is set
    const oldLocation = path.join(this.consumer.getPath(), this.component.componentMap.rootDir);
    logger.debugAndAddBreadCrumb(
      'component-writer._cleanOldNestedComponent',
      'deleting the old directory of a component at {oldLocation}',
      { oldLocation }
    );
    await fs.remove(oldLocation);
    await this._removeNodeModulesLinksFromDependents();
    this.bitMap.removeComponent(this.component.id);
  }

  async _removeNodeModulesLinksFromDependents() {
    if (!this.consumer) {
      throw new Error('ComponentWriter._removeNodeModulesLinksFromDependents expect to have a consumer');
    }
    const directDependentIds = await this.consumer.getAuthoredAndImportedDependentsIdsOf([this.component]);
    await Promise.all(
      directDependentIds.map((dependentId) => {
        const dependentComponentMap = this.consumer ? this.consumer.bitMap.getComponent(dependentId) : null;
        const relativeLinkPath = this.consumer
          ? getNodeModulesPathOfComponent(this.consumer.config.bindingPrefix, this.component.id)
          : null;
        const nodeModulesLinkAbs =
          this.consumer && dependentComponentMap && relativeLinkPath
            ? this.consumer.toAbsolutePath(path.join(dependentComponentMap.getRootDir(), relativeLinkPath))
            : null;
        if (nodeModulesLinkAbs) {
          logger.debug(`deleting an obsolete link to node_modules at ${nodeModulesLinkAbs}`);
        }
        return nodeModulesLinkAbs ? fs.remove(nodeModulesLinkAbs) : Promise.resolve();
      })
    );
  }

  _getConfigDir() {
    if (this.configDir) return this.configDir;
    if (this.consumer) return this.consumer.dirStructure.ejectedEnvsDirStructure;
    return new ConfigDir(DEFAULT_EJECTED_ENVS_DIR_PATH);
  }

  _getNextPatchVersion() {
    return semver.inc(this.component.version, 'prerelease') || '0.0.1-0';
  }
}
