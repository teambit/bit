import { ComponentID } from '@teambit/component-id';
import { DEFAULT_LANGUAGE, WORKSPACE_JSONC } from '@teambit/legacy.constants';
import { AbstractVinyl, DataToPersist } from '@teambit/component.sources';
import { LegacyWorkspaceConfig, ILegacyWorkspaceConfig } from '@teambit/legacy.consumer-config';
import { ExtensionDataList } from '@teambit/legacy.extension-data';
import { logger } from '@teambit/legacy.logger';
import { PathOsBased, PathOsBasedAbsolute } from '@teambit/legacy.utils';
import { currentDateAndTimeToFileName } from '@teambit/legacy.consumer';
import { assign, parse, stringify, CommentObject } from 'comment-json';
import * as fs from 'fs-extra';
import * as path from 'path';
import { omit } from 'lodash';
import { WorkspaceAspect } from '@teambit/workspace';
import { SetExtensionOptions } from './config.main.runtime';
import { ExtensionAlreadyConfigured } from './exceptions';
import InvalidConfigFile from './exceptions/invalid-config-file';
import { HostConfig } from './types';

const INTERNAL_CONFIG_PROPS = ['$schema', '$schemaVersion', 'require'];

export type LegacyInitProps = {
  standAlone?: boolean;
};

export type WorkspaceConfigFileProps = {
  // TODO: make it no optional
  $schema?: string;
  $schemaVersion?: string;
} & WorkspaceSettingsNewProps;

export type ComponentScopeDirMapEntry = {
  defaultScope?: string;
  directory: string;
};

export type ComponentScopeDirMap = Array<ComponentScopeDirMapEntry>;

export type WorkspaceExtensionProps = {
  name?: string;
  defaultScope?: string;
  defaultDirectory?: string;
  components?: ComponentScopeDirMap;
};

export type PackageManagerClients = 'npm' | 'yarn' | undefined;

export interface DependencyResolverExtensionProps {
  packageManager: PackageManagerClients;
  strictPeerDependencies?: boolean;
  extraArgs?: string[];
  packageManagerProcessOptions?: any;
  useWorkspaces?: boolean;
  manageWorkspaces?: boolean;
  externalPackageManager?: boolean;
}

export type WorkspaceSettingsNewProps = {
  'teambit.workspace/workspace': WorkspaceExtensionProps;
  'teambit.dependencies/dependency-resolver': DependencyResolverExtensionProps;
};

export class WorkspaceConfig implements HostConfig {
  raw?: any;
  _extensions: ExtensionDataList;
  isLegacy: boolean;

  constructor(
    private data: WorkspaceConfigFileProps,
    private _path: PathOsBasedAbsolute,
    private scopePath?: PathOsBasedAbsolute
  ) {
    this.raw = data;
    this.loadExtensions();
  }

  get path(): PathOsBased {
    return this._path;
  }

  get extensions(): ExtensionDataList {
    return this._extensions;
  }

  get extensionsIds(): string[] {
    return Object.keys(omit(this.raw, INTERNAL_CONFIG_PROPS));
  }

  private loadExtensions() {
    const withoutInternalConfig = omit(this.raw, INTERNAL_CONFIG_PROPS);
    this._extensions = ExtensionDataList.fromConfigObject(withoutInternalConfig);
  }

  extension(extensionId: string, ignoreVersion: boolean): any {
    const existing = this.extensions.findExtension(extensionId, ignoreVersion);
    return existing?.config;
  }

  setExtension(extensionId: string, config: Record<string, any>, options: SetExtensionOptions): any {
    const existing = this.extension(extensionId, options.ignoreVersion);
    if (existing) {
      if (options.mergeIntoExisting) {
        config = { ...existing, ...config };
      } else if (!options.overrideExisting) {
        throw new ExtensionAlreadyConfigured(extensionId);
      }
    }

    this.raw[extensionId] = config;
    this.loadExtensions();
  }

  renameExtensionInRaw(oldExtId: string, newExtId: string): boolean {
    let isChanged = false;
    if (this.raw[oldExtId]) {
      this.raw[newExtId] = this.raw[oldExtId];
      delete this.raw[oldExtId];
      isChanged = true;
    }
    const generatorEnvs = this.raw?.['teambit.generator/generator']?.envs;
    if (generatorEnvs && generatorEnvs.includes(oldExtId)) {
      generatorEnvs.splice(generatorEnvs.indexOf(oldExtId), 1, newExtId);
      isChanged = true;
    }
    return isChanged;
  }

  removeExtension(extCompId: ComponentID): boolean {
    const extId = extCompId.toStringWithoutVersion();
    let isChanged = false;
    const existingKey = this.getExistingKeyIgnoreVersion(extCompId);
    if (existingKey) {
      delete this.raw[existingKey];
      isChanged = true;
    }
    const generatorEnvs = this.raw?.['teambit.generator/generator']?.envs;
    if (generatorEnvs && generatorEnvs.includes(extId)) {
      generatorEnvs.splice(generatorEnvs.indexOf(extId), 1);
      isChanged = true;
    }
    if (isChanged) this.loadExtensions();
    return isChanged;
  }

  getExistingKeyIgnoreVersion(id: ComponentID): string | undefined {
    const idStr = id.toStringWithoutVersion();
    if (this.raw[idStr]) return idStr;
    const keys = Object.keys(this.raw);
    return keys.find((key) => key.startsWith(`${idStr}@`));
  }

  /**
   * Create an instance of the WorkspaceConfig by data
   *
   * @static
   * @param {WorkspaceConfigFileProps} data
   * @returns
   * @memberof WorkspaceConfig
   */
  static fromObject(data: WorkspaceConfigFileProps, workspaceJsoncPath: PathOsBased, scopePath?: PathOsBasedAbsolute) {
    return new WorkspaceConfig(data, workspaceJsoncPath, scopePath);
  }

  /**
   * Create an instance of the WorkspaceConfig by the workspace config template and override values
   *
   * @static
   * @param {WorkspaceConfigFileProps} data values to override in the default template
   * @returns
   * @memberof WorkspaceConfig
   */
  static async create(
    props: WorkspaceConfigFileProps,
    dirPath: PathOsBasedAbsolute,
    scopePath: PathOsBasedAbsolute,
    generator?: string
  ) {
    const template = await getWorkspaceConfigTemplateParsed();
    // previously, we just did `assign(template, props)`, but it was replacing the entire workspace config with the "props".
    // so for example, if the props only had defaultScope, it was removing the defaultDirectory.
    const workspaceAspectConf = assign(template[WorkspaceAspect.id], props[WorkspaceAspect.id]);

    // When external package manager mode is enabled, set conflicting properties to false in the template
    const depResolverConf = assign(
      template['teambit.dependencies/dependency-resolver'],
      props['teambit.dependencies/dependency-resolver']
    );
    if (depResolverConf.externalPackageManager) {
      // Override template defaults to be compatible with external package manager mode
      template['teambit.dependencies/dependency-resolver'] = template['teambit.dependencies/dependency-resolver'] || {};
      template['teambit.dependencies/dependency-resolver'].rootComponent = false;
    }

    const merged = assign(template, {
      [WorkspaceAspect.id]: workspaceAspectConf,
      'teambit.dependencies/dependency-resolver': depResolverConf,
    });

    if (generator) {
      const generators = generator.split(',').map((g) => g.trim());
      merged['teambit.generator/generator'] = { envs: generators };
    }

    const workspaceConfig = new WorkspaceConfig(
      merged as WorkspaceConfigFileProps,
      WorkspaceConfig.composeWorkspaceJsoncPath(dirPath),
      scopePath
    );

    // Validate external package manager configuration
    workspaceConfig.validateExternalPackageManagerConfig();

    return workspaceConfig;
  }

  /**
   * Ensure the given directory has a workspace config
   * Load if existing and create new if not
   *
   * @static
   * @param {PathOsBasedAbsolute} dirPath
   * @param {WorkspaceConfigFileProps} [workspaceConfigProps={} as any]
   * @returns {Promise<WorkspaceConfig>}
   * @memberof WorkspaceConfig
   */
  static async ensure(
    dirPath: PathOsBasedAbsolute,
    scopePath: PathOsBasedAbsolute,
    workspaceConfigProps: WorkspaceConfigFileProps = {} as any,
    generator?: string
  ): Promise<WorkspaceConfig> {
    try {
      let workspaceConfig = await this.loadIfExist(dirPath, scopePath);
      if (workspaceConfig) {
        return workspaceConfig;
      }
      workspaceConfig = await this.create(workspaceConfigProps, dirPath, scopePath, generator);
      return workspaceConfig;
    } catch (err: any) {
      if (err instanceof InvalidConfigFile) {
        const workspaceConfig = this.create(workspaceConfigProps, dirPath, scopePath, generator);
        return workspaceConfig;
      }
      throw err;
    }
  }

  static async reset(dirPath: PathOsBasedAbsolute, resetHard: boolean): Promise<void> {
    const workspaceJsoncPath = WorkspaceConfig.composeWorkspaceJsoncPath(dirPath);
    if (resetHard && workspaceJsoncPath) {
      logger.info(`deleting the consumer workspace.jsonc file at ${workspaceJsoncPath}`);
      await fs.remove(workspaceJsoncPath);
    }
  }

  /**
   * Get the path of the workspace.jsonc file by a containing folder
   *
   * @static
   * @param {PathOsBased} dirPath containing dir of the workspace.jsonc file
   * @returns {PathOsBased}
   * @memberof WorkspaceConfig
   */
  static composeWorkspaceJsoncPath(dirPath: PathOsBased): PathOsBased {
    return path.join(dirPath, WORKSPACE_JSONC);
  }

  static async pathHasWorkspaceJsonc(dirPath: PathOsBased): Promise<boolean> {
    const isExist = await fs.pathExists(WorkspaceConfig.composeWorkspaceJsoncPath(dirPath));
    return isExist;
  }

  /**
   * Check if the given dir has workspace config (new or legacy)
   * @param dirPath
   */
  static async isExist(dirPath: PathOsBased): Promise<boolean | undefined> {
    const jsoncExist = await WorkspaceConfig.pathHasWorkspaceJsonc(dirPath);
    if (jsoncExist) {
      return true;
    }
    return LegacyWorkspaceConfig._isExist(dirPath);
  }

  /**
   * Load the workspace configuration if it's exist
   *
   * @static
   * @param {PathOsBased} dirPath
   * @returns {(Promise<WorkspaceConfig | undefined>)}
   * @memberof WorkspaceConfig
   */
  static async loadIfExist(
    dirPath: PathOsBased,
    scopePath?: PathOsBasedAbsolute
  ): Promise<WorkspaceConfig | undefined> {
    const jsoncExist = await WorkspaceConfig.pathHasWorkspaceJsonc(dirPath);
    if (jsoncExist) {
      const jsoncPath = WorkspaceConfig.composeWorkspaceJsoncPath(dirPath);
      const instance = await WorkspaceConfig._loadFromWorkspaceJsonc(jsoncPath, scopePath);
      return instance;
    }
    return undefined;
  }

  static async _loadFromWorkspaceJsonc(workspaceJsoncPath: PathOsBased, scopePath?: string): Promise<WorkspaceConfig> {
    const contentBuffer = await fs.readFile(workspaceJsoncPath);
    let parsed;
    try {
      parsed = parse(contentBuffer.toString());
    } catch {
      throw new InvalidConfigFile(workspaceJsoncPath);
    }
    const workspaceConfig = WorkspaceConfig.fromObject(parsed, workspaceJsoncPath, scopePath);

    // Validate external package manager configuration
    workspaceConfig.validateExternalPackageManagerConfig();

    return workspaceConfig;
  }

  async write({ dir, reasonForChange }: { dir?: PathOsBasedAbsolute; reasonForChange?: string } = {}): Promise<void> {
    const getCalculatedDir = () => {
      if (dir) return dir;
      return path.dirname(this._path);
    };
    const calculatedDir = getCalculatedDir();
    const files = await this.toVinyl(calculatedDir);
    const dataToPersist = new DataToPersist();
    if (files) {
      dataToPersist.addManyFiles(files);
      await this.backupConfigFile(reasonForChange);
      await dataToPersist.persistAllToFS();
    }
  }

  async backupConfigFile(reasonForChange?: string) {
    if (!this.scopePath) {
      logger.error(`unable to backup workspace.jsonc file without scope path`);
      return;
    }
    try {
      const baseDir = this.getBackupHistoryDir();
      await fs.ensureDir(baseDir);
      const fileId = currentDateAndTimeToFileName();
      const backupPath = path.join(baseDir, fileId);
      await fs.copyFile(this._path, backupPath);
      const metadataFile = this.getBackupMetadataFilePath();
      await fs.appendFile(metadataFile, `${fileId} ${reasonForChange || ''}\n`);
    } catch (err: any) {
      if (err.code === 'ENOENT') return; // no such file or directory, meaning the .bitmap file doesn't exist (yet)
      // it's a nice to have feature. don't kill the process if something goes wrong.
      logger.error(`failed to backup workspace.jsonc`, err);
    }
  }
  private getBackupDir() {
    if (!this.scopePath) throw new Error('unable to get backup dir without scope path');
    return path.join(this.scopePath, 'workspace-config-history');
  }
  getBackupHistoryDir() {
    return path.join(this.getBackupDir(), 'files');
  }
  getBackupMetadataFilePath() {
    return path.join(this.getBackupDir(), 'metadata.txt');
  }
  private async getParsedHistoryMetadata(): Promise<{ [fileId: string]: string }> {
    let fileContent: string | undefined;
    try {
      fileContent = await fs.readFile(this.getBackupMetadataFilePath(), 'utf-8');
    } catch (err: any) {
      if (err.code === 'ENOENT') return {}; // no such file or directory, meaning the history-metadata file doesn't exist (yet)
    }
    const lines = fileContent?.split('\n') || [];
    const metadata = {};
    lines.forEach((line) => {
      const [fileId, ...reason] = line.split(' ');
      if (!fileId) return;
      metadata[fileId] = reason.join(' ');
    });
    return metadata;
  }

  async toVinyl(workspaceDir: PathOsBasedAbsolute): Promise<AbstractVinyl[] | undefined> {
    const jsonStr = `${stringify(this.data, undefined, 2)}\n`;
    const base = workspaceDir;
    const fullPath = workspaceDir ? WorkspaceConfig.composeWorkspaceJsoncPath(workspaceDir) : this.path;
    const jsonFile = new AbstractVinyl({ base, path: fullPath, contents: Buffer.from(jsonStr) });
    return [jsonFile];
  }

  toLegacy(): ILegacyWorkspaceConfig {
    let componentsDefaultDirectory = this.extension('teambit.workspace/workspace', true)?.defaultDirectory;
    if (componentsDefaultDirectory && !componentsDefaultDirectory.includes('{name}')) {
      componentsDefaultDirectory = `${componentsDefaultDirectory}/{name}`;
    }

    return {
      lang: DEFAULT_LANGUAGE,
      defaultScope: this.extension('teambit.workspace/workspace', true)?.defaultScope,
      _useWorkspaces: this.extension('teambit.dependencies/dependency-resolver', true)?.useWorkspaces,
      dependencyResolver: this.extension('teambit.dependencies/dependency-resolver', true),
      packageManager: this.extension('teambit.dependencies/dependency-resolver', true)?.packageManager,
      componentsDefaultDirectory,
      _manageWorkspaces: this.extension('teambit.dependencies/dependency-resolver', true)?.manageWorkspaces,
      extensions: this.extensions.toConfigObject(),
      // @ts-ignore
      path: this.path,
      isLegacy: false,
      write: ({ workspaceDir }) => this.write.call(this, { dir: workspaceDir }),
      toVinyl: this.toVinyl.bind(this),
      _legacyPlainObject: () => undefined,
    };
  }

  /**
   * Validates that external package manager configuration is compatible with other settings
   */
  validateExternalPackageManagerConfig(): void {
    const depResolverExt = this.extension('teambit.dependencies/dependency-resolver', true);
    if (!depResolverExt?.externalPackageManager) {
      return; // No validation needed if external package manager is not enabled
    }

    const conflicts: string[] = [];

    // Check dependency-resolver aspect conflicts
    if (depResolverExt?.rootComponent === true) {
      conflicts.push('rootComponent cannot be true when externalPackageManager is enabled');
    }

    if (conflicts.length > 0) {
      throw new Error(
        `External package manager mode is incompatible with the following settings:\n${conflicts.map((c) => `  - ${c}`).join('\n')}\n\nPlease set these properties to false or remove them from your workspace.jsonc`
      );
    }
  }
}

export async function getWorkspaceConfigTemplateParsed(): Promise<Record<string, any>> {
  let fileContent: Buffer;
  try {
    fileContent = await fs.readFile(path.join(__dirname, 'workspace-template.jsonc'));
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
    // when the extension is compiled by tsc, it doesn't copy .jsonc files into the dists, grab it from src
    fileContent = await fs.readFile(path.join(__dirname, '..', 'workspace-template.jsonc'));
  }
  return parse(fileContent.toString()) as CommentObject;
}

export function stringifyWorkspaceConfig(workspaceConfig: Record<string, any>): string {
  return stringify(workspaceConfig, undefined, 2);
}
