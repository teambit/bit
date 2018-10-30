// @flow
import fs from 'fs-extra';
import path from 'path';
import Component from '../component/consumer-component';
import ComponentMap from '../bit-map/component-map';
import { BitId, BitIds } from '../../bit-id';
import { Consumer } from '..';
import logger from '../../logger/logger';
import GeneralError from '../../error/general-error';
import BitMap from '../bit-map';
import { pathNormalizeToLinux } from '../../utils/path';
import { COMPONENT_ORIGINS } from '../../constants';
import mkdirp from '../../utils/mkdirp';

type ComponentWriterProps = {
  component: Component,
  bitDir?: string,
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
  bitDir: ?string;
  dirToWrite: string;
  writeConfig: boolean;
  configDir: ?string;
  resolvedConfigDir: string;
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
  constructor({
    component,
    bitDir,
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
    this.bitDir = bitDir;
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
   * check whether this component is in bitMap, if it's there, write the files according to the paths in bit.map.
   * Otherwise, write to bitDir and update bitMap with the new paths.
   */
  async write() {
    logger.debug(`component-writer.write, id: ${this.component.id.toString()}`);
    const consumerPath: string = this.consumer.getPath();
    const bitMap: BitMap = this.consumer.bitMap;
    if (!this.component.files) {
      throw new GeneralError(`Component ${this.component.id.toString()} is invalid as it has no files`);
    }
    // Take the bitdir from the files (it will be the same for all the files of course)
    this.dirToWrite = this.bitDir || this.component.files[0].base;
    // Update files base dir according to this.bitDir
    if (this.component.files && this.bitDir) {
      this.component.files.forEach(file => file.updatePaths({ newBase: this.bitDir }));
    }
    if (!this.component.dists.isEmpty() && this.bitDir) {
      this.component.dists.get().forEach(dist => dist.updatePaths({ newBase: this.bitDir }));
    }

    // if there is no componentMap, the component is new to this project and should be written to bit.map
    this.componentMap = this.existingComponentMap || this.addComponentToBitMap();
    if (!this.consumer.shouldDistsBeInsideTheComponent() && this.component.dists.isEmpty()) {
      // since the dists are set to be outside the components dir, the source files must be saved there
      // otherwise, other components in dists won't be able to link to this component
      this.component.copyFilesIntoDists();
    }
    // For IMPORTED component we have to delete the content of the directory before importing.
    // Otherwise, when the author adds new files outside of the previous originallySharedDir and this user imports them
    // the environment will contain both copies, the old one with the old originallySharedDir and the new one.
    // If a user made changes to the imported component, it will show a warning and stop the process.
    if (typeof this.deleteBitDirContent === 'undefined') {
      this.deleteBitDirContent = this.origin === COMPONENT_ORIGINS.IMPORTED;
    }
    // when there is componentMap, this component (with this version or other version) is already part of the project.
    // There are several options as to what was the origin before and what is the origin now and according to this,
    // we update/remove/don't-touch the record in bit.map.
    // The current origin can't be AUTHORED because when the author creates a component for the first time,
    // 1) current origin is AUTHORED - If the version is the same as before, don't update bit.map. Otherwise, update.
    // 2) current origin is IMPORTED - If the version is the same as before, don't update bit.map. Otherwise, update.
    // one exception is where the origin was NESTED before, in this case, remove the current record and add a new one.
    // 3) current origin is NESTED - the version can't be the same as before (otherwise it would be ignored before and
    // never reach this function, see @write-components.writeToComponentsDir). Therefore, always add to bit.map.
    if (this.origin === COMPONENT_ORIGINS.IMPORTED && this.componentMap.origin === COMPONENT_ORIGINS.NESTED) {
      // when a user imports a component that was a dependency before, write the component directly into the components
      // directory for an easy access/change. Then, remove the current record from bit.map and add an updated one.
      await this._cleanOldNestedComponent();
      this.componentMap = this.addComponentToBitMap();
    }
    logger.debug('component is in bit.map, write the files according to bit.map');
    if (this.componentMap.origin === COMPONENT_ORIGINS.AUTHORED) this.writeConfig = false;
    const newBase = this.componentMap.rootDir ? path.join(consumerPath, this.componentMap.rootDir) : consumerPath;
    this.component.writtenPath = newBase;
    this.component.files.forEach(file => file.updatePaths({ newBase }));
    // $FlowFixMe
    this.resolvedConfigDir = this.configDir || this.componentMap.configDir;

    const componentMapExistWithSameVersion = bitMap.isExistWithSameVersion(this.component.id);
    const updateBitMap =
      !componentMapExistWithSameVersion || this.componentMap.originallySharedDir !== this.component.originallySharedDir;
    // update bitMap before writing the files to the filesystem, because as part of writing the
    // package-json file, the componentMap is needed to be stored with the updated version
    if (updateBitMap) {
      if (componentMapExistWithSameVersion) {
        // originallySharedDir has been changed. it affects also the relativePath of the files
        // so it's better to just remove the old record and add a new one
        bitMap.removeComponent(this.component.id);
      }
      this.addComponentToBitMap(this.componentMap.rootDir);
    }

    // Don't write the package.json for an authored component, because it's dependencies probably managed
    // By the root package.json
    this.writePackageJson = this.writePackageJson && this.origin !== COMPONENT_ORIGINS.AUTHORED;
    await this._writeToComponentDir();

    return this.component;
  }

  async _writeToComponentDir() {
    if (this.deleteBitDirContent) {
      logger.info(`consumer-component._writeToComponentDir, deleting ${this.dirToWrite}`);
      await fs.emptyDir(this.dirToWrite);
    } else {
      await mkdirp(this.dirToWrite);
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
    if (this.writePackageJson && (this.consumer.isolated || this.dirToWrite !== this.consumer.getPath())) {
      await this.component.writePackageJson(
        this.consumer,
        this.dirToWrite,
        this.override,
        this.writeBitDependencies,
        this.excludeRegistryPrefix
      );
    }
    if (this.component.license && this.component.license.src) {
      await this.component.license.write(this.dirToWrite, this.override);
    }
    logger.debug('component has been written successfully');
    return this;
  }

  addComponentToBitMap(rootDir?: ?string): ComponentMap {
    const filesForBitMap = this.component.files.map((file) => {
      return { name: file.basename, relativePath: pathNormalizeToLinux(file.relative), test: file.test };
    });

    return this.consumer.bitMap.addComponent({
      componentId: this.component.id,
      files: filesForBitMap,
      mainFile: this.component.mainFile,
      rootDir: rootDir || this.dirToWrite,
      configDir: this.resolvedConfigDir || this.configDir,
      detachedCompiler: this.component.detachedCompiler,
      detachedTester: this.component.detachedTester,
      origin: this.origin,
      parent: this.parent,
      originallySharedDir: this.component.originallySharedDir,
      wrapDir: this.component.wrapDir
    });
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
        const relativeLinkPath = Consumer.getNodeModulesPathOfComponent(
          this.consumer.bitJson.bindingPrefix,
          this.component.id
        );
        const nodeModulesLinkAbs = this.consumer.toAbsolutePath(
          path.join(dependentComponentMap.rootDir || '.', relativeLinkPath)
        );
        logger.debug(`deleting an obsolete link to node_modules at ${nodeModulesLinkAbs}`);
        return fs.remove(nodeModulesLinkAbs);
      })
    );
  }
}
