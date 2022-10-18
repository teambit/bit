import fs from 'fs-extra';
import * as path from 'path';
import { BitIds } from '../../bit-id';
import ShowDoctorError from '../../error/show-doctor-error';
import logger from '../../logger/logger';
import { Scope } from '../../scope';
import getNodeModulesPathOfComponent from '../../utils/bit/component-node-modules-path';
import { PathLinuxRelative, pathNormalizeToLinux } from '../../utils/path';
import BitMap from '../bit-map/bit-map';
import ComponentMap from '../bit-map/component-map';
import Component from '../component/consumer-component';
import DataToPersist from '../component/sources/data-to-persist';
import RemovePath from '../component/sources/remove-path';
import Consumer from '../consumer';

export type ComponentWriterProps = {
  component: Component;
  writeToPath: PathLinuxRelative;
  writeConfig?: boolean;
  writePackageJson?: boolean;
  override?: boolean;
  isolated?: boolean;
  consumer: Consumer | undefined;
  scope?: Scope | undefined;
  bitMap: BitMap;
  ignoreBitDependencies?: boolean | BitIds;
  deleteBitDirContent?: boolean;
  existingComponentMap?: ComponentMap;
};

export default class ComponentWriter {
  component: Component;
  writeToPath: PathLinuxRelative;
  writeConfig?: boolean;
  writePackageJson?: boolean;
  override: boolean; // default to true
  isolated?: boolean;
  consumer: Consumer | undefined; // when using capsule, the consumer is not defined
  scope?: Scope | undefined;
  bitMap: BitMap;
  ignoreBitDependencies: boolean | BitIds;
  deleteBitDirContent: boolean | undefined;
  existingComponentMap: ComponentMap | undefined;

  constructor({
    component,
    writeToPath,
    writeConfig = false,
    writePackageJson = true,
    override = true,
    isolated = false,
    consumer,
    scope = consumer?.scope,
    bitMap,
    ignoreBitDependencies = true,
    deleteBitDirContent,
    existingComponentMap,
  }: ComponentWriterProps) {
    this.component = component;
    this.writeToPath = writeToPath;
    this.writeConfig = writeConfig;
    this.writePackageJson = writePackageJson;
    this.override = override;
    this.isolated = isolated;
    this.consumer = consumer;
    this.scope = scope;
    this.bitMap = bitMap;
    this.ignoreBitDependencies = ignoreBitDependencies;
    this.deleteBitDirContent = deleteBitDirContent;
    this.existingComponentMap = existingComponentMap;
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
    if (this.isolated) throw new Error('for isolation, please use this.populateComponentsFilesToWriteForCapsule()');
    if (!this.component.files || !this.component.files.length) {
      throw new ShowDoctorError(`Component ${this.component.id.toString()} is invalid as it has no files`);
    }
    this.throwForImportingLegacyIntoHarmony();
    this.component.dataToPersist = new DataToPersist();
    this._updateFilesBasePaths();
    this.component.componentMap = this.existingComponentMap || this.addComponentToBitMap(this.writeToPath);
    this.deleteBitDirContent = false;
    this._updateComponentRootPathAccordingToBitMap();
    this.component.componentMap = this.addComponentToBitMap(this.component.componentMap.rootDir);
    this.writePackageJson = false;
    await this.populateFilesToWriteToComponentDir();
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

  addComponentToBitMap(rootDir: string | undefined): ComponentMap {
    if (rootDir === '.') {
      throw new Error('addComponentToBitMap: rootDir cannot be "."');
    }
    const filesForBitMap = this.component.files.map((file) => {
      return { name: file.basename, relativePath: pathNormalizeToLinux(file.relative), test: file.test };
    });

    return this.bitMap.addComponent({
      componentId: this.component.id,
      files: filesForBitMap,
      mainFile: pathNormalizeToLinux(this.component.mainFile),
      rootDir,
    });
  }

  _updateComponentRootPathAccordingToBitMap() {
    // @ts-ignore this.component.componentMap is set
    this.writeToPath = this.component.componentMap.getRootDir();
    this.component.writtenPath = this.writeToPath;
    this._updateFilesBasePaths();
  }

  _updateFilesBasePaths() {
    const newBase = this.writeToPath || '.';
    this.component.files.forEach((file) => file.updatePaths({ newBase }));
  }

  async _cleanOldNestedComponent() {
    if (!this.consumer) throw new Error('ComponentWriter._cleanOldNestedComponent expect to have a consumer');
    // @ts-ignore this function gets called when it was previously NESTED, so the rootDir is set
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
}
