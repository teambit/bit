import fs from 'fs-extra';
import * as path from 'path';
import semver from 'semver';
import { flatten } from 'lodash';
import { BitIds } from '../../bit-id';
import { COMPONENT_ORIGINS } from '../../constants';
import ShowDoctorError from '../../error/show-doctor-error';
import logger from '../../logger/logger';
import { Scope } from '../../scope';
import getNodeModulesPathOfComponent from '../../utils/bit/component-node-modules-path';
import { PathLinuxRelative, pathNormalizeToLinux } from '../../utils/path';
import BitMap from '../bit-map/bit-map';
import ComponentMap, { ComponentOrigin } from '../bit-map/component-map';
import Component from '../component/consumer-component';
import PackageJsonFile from '../component/package-json-file';
import { PackageJsonTransformer } from '../component/package-json-transformer';
import DataToPersist from '../component/sources/data-to-persist';
import RemovePath from '../component/sources/remove-path';
import Consumer from '../consumer';
import { ArtifactVinyl } from '../component/sources/artifact';
import { getArtifactFilesByExtension } from '../component/sources/artifact-files';
import { preparePackageJsonToWrite } from '../component/package-json-utils';

export type ComponentWriterProps = {
  component: Component;
  writeToPath: PathLinuxRelative;
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
  applyPackageJsonTransformers?: boolean;
};

export default class ComponentWriter {
  component: Component;
  writeToPath: PathLinuxRelative;
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
    this.component.dataToPersist.addBasePath(this.consumer.getPath());
    await this.component.dataToPersist.persistAllToFS();
    return this.component;
  }

  async populateComponentsFilesToWrite(): Promise<Component> {
    if (!this.component.files || !this.component.files.length) {
      throw new ShowDoctorError(`Component ${this.component.id.toString()} is invalid as it has no files`);
    }
    this.throwForImportingLegacyIntoHarmony();
    this.component.dataToPersist = new DataToPersist();
    this._updateFilesBasePaths();
    this.component.componentMap = this.existingComponentMap || this.addComponentToBitMap(this.writeToPath);
    this._determineWhetherToDeleteComponentDirContent();
    this._determineWhetherToWriteConfig();
    this._updateComponentRootPathAccordingToBitMap();
    this._updateBitMapIfNeeded();
    this._determineWhetherToWritePackageJson();
    await this.populateFilesToWriteToComponentDir();
    if (this.isolated) await this.populateArtifacts();
    return this.component;
  }

  private throwForImportingLegacyIntoHarmony() {
    if (this.component.isLegacy && this.consumer) {
      throw new Error(
        `unable to write component "${this.component.id.toString()}", it is a legacy component and this workspace is Harmony`
      );
    }
  }

  async populateFilesToWriteToComponentDir() {
    if (this.deleteBitDirContent) {
      this.component.dataToPersist.removePath(new RemovePath(this.writeToPath));
    }
    this.component.files.forEach((file) => (file.override = this.override));
    this.component.files.map((file) => this.component.dataToPersist.addFile(file));

    // make sure the project's package.json is not overridden by Bit
    // If a consumer is of isolated env it's ok to override the root package.json (used by the env installation
    // of compilers / testers / extensions)
    // In Harmony this is happening inside a capsule, which needs a package.json file
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
        undefined,
        Boolean(this.isolated)
      );

      // @todo: temporarily this is running only when there is no version (or version is "latest")
      // so then package.json always has a valid version. we'll need to figure out when the version
      // needs to be incremented and when it should not.
      if ((!this.consumer || this.consumer.isolated) && !this.component.id.hasVersion()) {
        // this only needs to be done in an isolated
        // or consumerless (dependency in an isolated) environment
        packageJson.addOrUpdateProperty('version', this._getNextPatchVersion());
      }
      if ((!this.consumer?.isLegacy || !this.scope?.isLegacy) && this.applyPackageJsonTransformers) {
        await this._applyTransformers(this.component, packageJson);
      }

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
    if (this.component.buildStatus !== 'succeed') {
      // this is important for "bit sign" when on lane to not go to the original scope
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
        // if (!(artifactFiles instanceof ArtifactFiles)) {
        //   artifactFiles = deserializeArtifactFiles(artifactFiles);
        // }

        // fyi, if this is coming from the isolator aspect, it is optimized to import all at once.
        // see artifact-files.importMultipleDistsArtifacts().

        await artifactFiles.importMissingArtifactObjects(scope);
        const vinylFiles = artifactFiles.getExistingVinyls();
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
    if (!this.consumer || this.component.isLegacy) return this.component.writtenPath;
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

  _updateComponentRootPathAccordingToBitMap() {
    // $FlowFixMe this.component.componentMap is set
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.writeToPath = this.component.componentMap.getRootDir();
    this.component.writtenPath = this.writeToPath;
    this._updateFilesBasePaths();
  }

  _updateBitMapIfNeeded() {
    if (this.isolated) return;
    // @ts-ignore this.component.componentMap is set
    this.component.componentMap = this.addComponentToBitMap(this.component.componentMap.rootDir);
  }

  _determineWhetherToWriteConfig() {
    // $FlowFixMe this.component.componentMap is set
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (this.component.componentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
      this.writeConfig = false;
    }
  }

  _determineWhetherToWritePackageJson() {
    this.writePackageJson = this.writePackageJson && this.origin !== COMPONENT_ORIGINS.AUTHORED;
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
