import type { ComponentID, ComponentIdList } from '@teambit/component-id';
import type { Scope } from '@teambit/legacy.scope';
import type { PathLinuxRelative } from '@teambit/legacy.utils';
import { pathNormalizeToLinux } from '@teambit/legacy.utils';
import type { BitMap, ComponentMap } from '@teambit/legacy.bit-map';
import { WORKSPACE_ROOT_DIR } from '@teambit/legacy.bit-map';
import { BIT_MAP } from '@teambit/legacy.constants';
import type { ConsumerComponent as Component } from '@teambit/legacy.consumer-component';
import { DataToPersist, RemovePath } from '@teambit/component.sources';
import type { Consumer } from '@teambit/legacy.consumer';
import { isHash } from '@teambit/component-version';
import { Ref } from '@teambit/objects';
import type { Workspace } from '@teambit/workspace';
import { BitError } from '@teambit/bit-error';

export type ComponentWriterProps = {
  component: Component;
  writeToPath: PathLinuxRelative;
  writeConfig?: boolean;
  writePackageJson?: boolean;
  override?: boolean;
  isolated?: boolean;
  workspace: Workspace;
  scope?: Scope | undefined;
  bitMap: BitMap;
  ignoreBitDependencies?: boolean | ComponentIdList;
  deleteBitDirContent?: boolean;
  existingComponentMap?: ComponentMap;
  skipUpdatingBitMap?: boolean;
};

export default class ComponentWriter {
  component: Component;
  writeToPath: PathLinuxRelative;
  writeConfig?: boolean;
  writePackageJson?: boolean;
  override: boolean; // default to true
  isolated?: boolean;
  consumer: Consumer | undefined; // when using capsule, the consumer is not defined
  workspace: Workspace;
  scope?: Scope | undefined;
  bitMap: BitMap;
  ignoreBitDependencies: boolean | ComponentIdList;
  deleteBitDirContent: boolean | undefined;
  existingComponentMap: ComponentMap | undefined;
  skipUpdatingBitMap?: boolean;

  constructor({
    component,
    writeToPath,
    writeConfig = false,
    writePackageJson = true,
    override = true,
    isolated = false,
    workspace,
    scope = workspace.consumer?.scope,
    bitMap,
    ignoreBitDependencies = true,
    deleteBitDirContent,
    existingComponentMap,
    skipUpdatingBitMap,
  }: ComponentWriterProps) {
    this.component = component;
    this.writeToPath = writeToPath;
    this.writeConfig = writeConfig;
    this.writePackageJson = writePackageJson;
    this.override = override;
    this.isolated = isolated;
    this.workspace = workspace;
    this.consumer = workspace.consumer;
    this.scope = scope;
    this.bitMap = bitMap;
    this.ignoreBitDependencies = ignoreBitDependencies;
    this.deleteBitDirContent = deleteBitDirContent;
    this.existingComponentMap = existingComponentMap;
    this.skipUpdatingBitMap = skipUpdatingBitMap;
  }

  async populateComponentsFilesToWrite(): Promise<Component> {
    if (this.isolated) throw new Error('for isolation, please use this.populateComponentsFilesToWriteForCapsule()');
    if (!this.component.files || !this.component.files.length) {
      throw new BitError(`Component ${this.component.id.toString()} is invalid as it has no files`);
    }
    this.throwForImportingLegacyIntoHarmony();
    this.component.dataToPersist = new DataToPersist();
    this.component.componentMap = this.existingComponentMap || (await this.addComponentToBitMap(this.writeToPath));
    this.deleteBitDirContent = false;
    this._updateComponentRootPathAccordingToBitMap();
    if (!this.skipUpdatingBitMap) {
      this.component.componentMap = await this.addComponentToBitMap(this.component.componentMap.rootDir);
    }
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
    const filesToWrite = this.component.files.filter((file) => !this.shouldSkipWritingFile(file));
    filesToWrite.forEach((file) => (file.override = this.override));
    filesToWrite.map((file) => this.component.dataToPersist.addFile(file));

    if (this.component.license && this.component.license.contents) {
      this.component.license.updatePaths({ newBase: this.writeToPath });
      this.component.license.override = this.override;
      this.component.dataToPersist.addFile(this.component.license);
    }
    if (this.writeConfig) {
      const vinylFile = await this.workspace.getComponentConfigVinylFile(this.component.id, { override: true }, true);
      this.component.dataToPersist.addFile(vinylFile);
    }
  }

  /**
   * `.bitmap` is only ever a file of the workspace-root component, and it is never safe to write:
   * writing it into a sub-directory (importing a workspace-root component into another workspace)
   * creates a broken nested workspace there, and writing it onto the workspace root would clobber
   * the live map with a stale one - while the very operation doing the write is mutating it.
   * the rest of the component's files are written normally.
   */
  private shouldSkipWritingFile(file: { relative: string }): boolean {
    return pathNormalizeToLinux(file.relative) === BIT_MAP;
  }

  async addComponentToBitMap(rootDir: string): Promise<ComponentMap> {
    // "." is a valid rootDir only for the component that owns this workspace's root. it is never a
    // valid *target* to write some other component into.
    if (rootDir === WORKSPACE_ROOT_DIR && this.existingComponentMap?.rootDir !== WORKSPACE_ROOT_DIR) {
      throw new BitError(
        `unable to write "${this.component.id.toString()}" to the workspace root.
the workspace root is owned by the workspace itself, a component can only be written into its own directory`
      );
    }
    const filesForBitMap = this.component.files.map((file) => {
      return { name: file.basename, relativePath: pathNormalizeToLinux(file.relative), test: file.test };
    });

    const bitId = await this.replaceSnapWithTagIfNeeded();
    const compId = this.workspace.resolveIdWithDefaultScope(bitId);
    const defaultScope = compId.hasScope()
      ? undefined
      : await this.workspace.componentDefaultScopeFromComponentDirAndName(rootDir, bitId.fullName);

    return this.bitMap.addComponent({
      componentId: compId,
      files: filesForBitMap,
      defaultScope,
      mainFile: pathNormalizeToLinux(this.component.mainFile),
      rootDir,
    });
  }

  private async replaceSnapWithTagIfNeeded(): Promise<ComponentID> {
    const version = this.component.id.version;
    if (!version || !isHash(version)) {
      return this.component.id;
    }
    const compFromModel = await this.scope?.getModelComponentIfExist(this.component.id);
    const tag = compFromModel?.getTagOfRefIfExists(Ref.from(version));
    if (tag) return this.component.id.changeVersion(tag);
    return this.component.id;
  }

  _updateComponentRootPathAccordingToBitMap() {
    // @ts-ignore this.component.componentMap is set
    this.writeToPath = this.component.componentMap.getRootDir();
    this.component.writtenPath = this.writeToPath;
    this._updateFilesBasePaths();
  }

  private _updateFilesBasePaths() {
    const newBase = this.writeToPath || '.';
    this.component.files.forEach((file) => file.updatePaths({ newBase }));
  }
}
