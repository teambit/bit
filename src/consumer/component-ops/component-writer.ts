import fs from 'fs-extra';
import * as path from 'path';
import R from 'ramda';
import semver from 'semver';
import { flatten } from 'lodash';
import { BitIds } from '../../bit-id';
import { COMPILER_ENV_TYPE, COMPONENT_DIST_PATH_TEMPLATE, COMPONENT_ORIGINS, TESTER_ENV_TYPE } from '../../constants';
import ShowDoctorError from '../../error/show-doctor-error';
import EnvExtension from '../../legacy-extensions/env-extension';
import logger from '../../logger/logger';
import { Scope } from '../../scope';
import getNodeModulesPathOfComponent from '../../utils/bit/component-node-modules-path';
import { getPathRelativeRegardlessCWD, pathNormalizeToLinux, PathOsBasedRelative } from '../../utils/path';
import BitMap from '../bit-map/bit-map';
import ComponentMap, { ComponentOrigin } from '../bit-map/component-map';
import Component from '../component/consumer-component';
import PackageJsonFile from '../component/package-json-file';
import { PackageJsonTransformer } from '../component/package-json-transformer';
import { preparePackageJsonToWrite } from '../component/package-json-utils';
import DataToPersist from '../component/sources/data-to-persist';
import RemovePath from '../component/sources/remove-path';
import ComponentConfig from '../config/component-config';
import Consumer from '../consumer';
import { ArtifactVinyl } from '../component/sources/artifact';
import {
  ArtifactFiles,
  deserializeArtifactFiles,
  getArtifactFilesByExtension,
} from '../component/sources/artifact-files';

export type ComponentWriterProps = {
  component: Component;
  writeToPath: PathOsBasedRelative;
  writeConfig?: boolean;
  writePackageJson?: boolean;
  override?: boolean;
  isolated?: boolean;
  origin: ComponentOrigin;
  consumer: Consumer | undefined;
  scope?: Scope | undefined;
  bitMap: BitMap;
  ignoreBitDependencies?: boolean | BitIds;
  deleteBitDirContent?: boolean;
  existingComponentMap?: ComponentMap;
  excludeRegistryPrefix?: boolean;
  saveOnLane?: boolean;
  applyPackageJsonTransformers?: boolean;
};

export default class ComponentWriter {
  component: Component;
  writeToPath: PathOsBasedRelative;
  writeConfig: boolean;
  writePackageJson: boolean;
  override: boolean;
  isolated: boolean | undefined;
  origin: ComponentOrigin;
  consumer: Consumer | undefined; // when using capsule, the consumer is not defined
  scope?: Scope | undefined;
  bitMap: BitMap;
  ignoreBitDependencies: boolean | BitIds;
  deleteBitDirContent: boolean | undefined;
  existingComponentMap: ComponentMap | undefined;
  excludeRegistryPrefix: boolean;
  saveOnLane: boolean;
  applyPackageJsonTransformers: boolean;

  constructor({
    component,
    writeToPath,
    writeConfig = false,
    writePackageJson = true,
    override = true,
    isolated = false,
    origin,
    consumer,
    scope = consumer?.scope,
    bitMap,
    ignoreBitDependencies = true,
    deleteBitDirContent,
    existingComponentMap,
    excludeRegistryPrefix = false,
    saveOnLane = false,
    applyPackageJsonTransformers = true,
  }: ComponentWriterProps) {
    this.component = component;
    this.writeToPath = writeToPath;
    this.writeConfig = writeConfig;
    this.writePackageJson = writePackageJson;
    this.override = override;
    this.isolated = isolated;
    this.origin = origin;
    this.consumer = consumer;
    this.scope = scope;
    this.bitMap = bitMap;
    this.ignoreBitDependencies = ignoreBitDependencies;
    this.deleteBitDirContent = deleteBitDirContent;
    this.existingComponentMap = existingComponentMap;
    this.excludeRegistryPrefix = excludeRegistryPrefix;
    this.saveOnLane = saveOnLane;
    this.applyPackageJsonTransformers = applyPackageJsonTransformers;
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

  async populateComponentsFilesToWrite(packageManager?: string): Promise<Component> {
    if (!this.component.files || !this.component.files.length) {
      throw new ShowDoctorError(`Component ${this.component.id.toString()} is invalid as it has no files`);
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
    await this.populateFilesToWriteToComponentDir(packageManager);
    if (this.isolated) await this.populateArtifacts();
    return this.component;
  }

  async populateFilesToWriteToComponentDir(packageManager?: string) {
    if (this.deleteBitDirContent) {
      this.component.dataToPersist.removePath(new RemovePath(this.writeToPath));
    }
    this.component.files.forEach((file) => (file.override = this.override));
    this.component.files.map((file) => this.component.dataToPersist.addFile(file));
    const dists = await this.component.dists.getDistsToWrite(this.component, this.bitMap, this.consumer, false);
    if (dists) this.component.dataToPersist.merge(dists);
    // TODO: change to new eject config
    // if (this.writeConfig && this.consumer) {
    //   const configToWrite = await this.component.getConfigToWrite(this.consumer, this.bitMap);
    //   this.component.dataToPersist.merge(configToWrite.dataToPersist);
    // }

    // make sure the project's package.json is not overridden by Bit
    // If a consumer is of isolated env it's ok to override the root package.json (used by the env installation
    // of compilers / testers / extensions)
    if (
      this.writePackageJson &&
      (this.isolated || (this.consumer && this.consumer.isolated) || this.writeToPath !== '.')
    ) {
      const artifactsDir = this.getArtifactsDir();
      const { packageJson, distPackageJson } = preparePackageJsonToWrite(
        this.bitMap,
        this.component,
        artifactsDir || this.writeToPath,
        this.override,
        this.ignoreBitDependencies,
        this.excludeRegistryPrefix,
        packageManager,
        Boolean(this.isolated)
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
      componentConfig.setCompiler(this.component.compiler ? this.component.compiler.toBitJsonObject() : {});
      componentConfig.setTester(this.component.tester ? this.component.tester.toBitJsonObject() : {});
      packageJson.addOrUpdateProperty('bit', componentConfig.toPlainObject());

      if ((!this.consumer?.isLegacy || !this.scope?.isLegacy) && this.applyPackageJsonTransformers) {
        await this._applyTransformers(this.component, packageJson);
      }

      this._mergeChangedPackageJsonProps(packageJson);
      this._mergePackageJsonPropsFromOverrides(packageJson);
      this.component.dataToPersist.addFile(packageJson.toVinylFile());
      if (distPackageJson) this.component.dataToPersist.addFile(distPackageJson.toVinylFile());
      this.component.packageJsonFile = packageJson;
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (this.component.license && this.component.license.contents) {
      this.component.license.updatePaths({ newBase: this.writeToPath });
      // $FlowFixMe this.component.license is set
      this.component.license.override = this.override;
      // $FlowFixMe this.component.license is set
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.component.dataToPersist.addFile(this.component.license);
    }
  }

  /**
   * currently, it writes all artifacts.
   * later, this responsibility might move to pkg extension, which could write only artifacts
   * that are set in package.json.files[], to have a similar structure of a package.
   */
  private async populateArtifacts() {
    if (!this.scope) {
      // when capsules are written via the workspace, do not write artifacts, they get created by
      // build-pipeline. when capsules are written via the scope, we do need the dists.
      return;
    }
    const extensionsNamesForArtifacts = ['teambit.compilation/compiler'];
    const artifactsFiles = flatten(
      extensionsNamesForArtifacts.map((extName) => getArtifactFilesByExtension(this.component.extensions, extName))
    );
    const scope = this.scope;
    const artifactsVinylFlattened: ArtifactVinyl[] = [];
    await Promise.all(
      artifactsFiles.map(async (artifactFiles) => {
        if (!artifactFiles) return;
        if (!(artifactFiles instanceof ArtifactFiles)) {
          artifactFiles = deserializeArtifactFiles(artifactFiles);
        }
        const vinylFiles = await artifactFiles.getVinylsAndImportIfMissing(this.component.scope as string, scope);
        artifactsVinylFlattened.push(...vinylFiles);
      })
    );
    const artifactsDir = this.getArtifactsDir();
    if (artifactsDir) {
      artifactsVinylFlattened.forEach((a) => a.updatePaths({ newBase: artifactsDir }));
    }
    this.component.dataToPersist.addManyFiles(artifactsVinylFlattened);
  }

  private getArtifactsDir() {
    // @todo: decide whether new components are allowed to be imported to a legacy workspace
    // if not, remove the "this.consumer.isLegacy" part in the condition below
    if (!this.consumer || this.consumer.isLegacy || this.component.isLegacy) return this.component.writtenPath;
    if (this.origin === COMPONENT_ORIGINS.NESTED) return this.component.writtenPath;
    return getNodeModulesPathOfComponent({ ...this.component, id: this.component.id, allowNonScope: true });
  }

  addComponentToBitMap(rootDir: string | undefined): ComponentMap {
    const filesForBitMap = this.component.files.map((file) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return { name: file.basename, relativePath: pathNormalizeToLinux(file.relative), test: file.test };
    });

    return this.bitMap.addComponent({
      componentId: this.component.id,
      files: filesForBitMap,
      mainFile: pathNormalizeToLinux(this.component.mainFile),
      rootDir,
      origin: this.origin,
      trackDir: this.existingComponentMap && this.existingComponentMap.trackDir,
      originallySharedDir: this.component.originallySharedDir,
      wrapDir: this.component.wrapDir,
      onLanesOnly: this.saveOnLane,
    });
  }

  /**
   * these changes were entered manually by a user via `overrides` key
   */
  _mergePackageJsonPropsFromOverrides(packageJson: PackageJsonFile) {
    const valuesToMerge = this.component.overrides.componentOverridesPackageJsonData;
    packageJson.mergePackageJsonObject(valuesToMerge);
  }

  /**
   * these are changes made by aspects
   */
  async _applyTransformers(component: Component, packageJson: PackageJsonFile) {
    return PackageJsonTransformer.applyTransformers(component, packageJson);
  }

  /**
   * these are changes done by a compiler
   */
  _mergeChangedPackageJsonProps(packageJson: PackageJsonFile) {
    if (!this.component.packageJsonChangedProps) return;
    const valuesToMerge = this._replaceDistPathTemplateWithCalculatedDistPath(packageJson);
    packageJson.mergePackageJsonObject(valuesToMerge);
  }

  /**
   * see https://github.com/teambit/bit/issues/1808 for more info why it's needed
   */
  _replaceDistPathTemplateWithCalculatedDistPath(packageJson: PackageJsonFile): Record<string, any> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const packageJsonChangedProps: Record<string, any> = this.component.packageJsonChangedProps;
    const isReplaceNeeded = R.values(packageJsonChangedProps).some((val) => val.includes(COMPONENT_DIST_PATH_TEMPLATE));
    if (!isReplaceNeeded) {
      return packageJsonChangedProps;
    }
    const distRootDir = this.component.dists.getDistDir(this.consumer, this.writeToPath || '.');
    const distRelativeToPackageJson = getPathRelativeRegardlessCWD(
      path.dirname(packageJson.filePath), // $FlowFixMe
      distRootDir
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
    // $FlowFixMe this.component.componentMap is set
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
   * 3) current origin is NESTED - If it was not NESTED before, don't update.
   */
  _updateBitMapIfNeeded() {
    if (this.isolated) return;
    const componentMapExistWithSameVersion = this.bitMap.isExistWithSameVersion(this.component.id);
    if (componentMapExistWithSameVersion) {
      if (
        this.existingComponentMap &&
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        this.existingComponentMap !== COMPONENT_ORIGINS.NESTED &&
        this.origin === COMPONENT_ORIGINS.NESTED
      ) {
        return;
      }
      this.bitMap.removeComponent(this.component.id);
    }
    // $FlowFixMe this.component.componentMap is set
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.component.componentMap = this.addComponentToBitMap(this.component.componentMap.rootDir);
  }

  async _updateConsumerConfigIfNeeded() {
    // for authored components there is no bit.json/package.json component specific
    // so if the overrides or envs were changed, it should be written to the consumer-config
    const areEnvsChanged = async (): Promise<boolean> => {
      // $FlowFixMe this.component.componentMap is set
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const context = { componentDir: this.component?.componentMap?.getComponentDir() };
      const compilerFromConsumer = this.consumer ? await this.consumer.getEnv(COMPILER_ENV_TYPE, context) : undefined;
      const testerFromConsumer = this.consumer ? await this.consumer.getEnv(TESTER_ENV_TYPE, context) : undefined;
      const compilerFromComponent = this.component.compiler ? this.component.compiler.toModelObject() : undefined;
      const testerFromComponent = this.component.tester ? this.component.tester.toModelObject() : undefined;
      return (
        EnvExtension.areEnvsDifferent(
          compilerFromConsumer ? compilerFromConsumer.toModelObject() : undefined,
          compilerFromComponent
        ) ||
        EnvExtension.areEnvsDifferent(
          testerFromConsumer ? testerFromConsumer.toModelObject() : undefined,
          testerFromComponent
        )
      );
    };
    if (this.component.componentMap?.origin === COMPONENT_ORIGINS.AUTHORED && this.consumer) {
      const envsChanged = await areEnvsChanged();
      const componentsConfig = this.consumer?.config?.componentsConfig;
      componentsConfig?.updateOverridesIfChanged(this.component, envsChanged);
    }
  }

  _determineWhetherToWriteConfig() {
    // $FlowFixMe this.component.componentMap is set
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
    // $FlowFixMe this.component.componentMap is set
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
    this.component.files.forEach((file) => file.updatePaths({ newBase }));
    if (!this.component.dists.isEmpty()) {
      this.component.dists.get().forEach((dist) => dist.updatePaths({ newBase }));
    }
  }

  async _cleanOldNestedComponent() {
    if (!this.consumer) throw new Error('ComponentWriter._cleanOldNestedComponent expect to have a consumer');
    // $FlowFixMe this function gets called when it was previously NESTED, so the rootDir is set
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
        const relativeLinkPath = this.consumer ? getNodeModulesPathOfComponent(this.component) : null;
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

  _getNextPatchVersion() {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return semver.inc(this.component.version!, 'prerelease') || '0.0.1-0';
  }
}
