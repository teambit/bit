import * as path from 'path';
import * as fs from 'fs-extra';
import { pick, omit } from 'ramda';
import { parse, stringify, assign } from 'comment-json';
import LegacyWorkspaceConfig from '../../consumer/config/workspace-config';
import ConsumerOverrides, { ConsumerOverridesOfComponent } from '../../consumer/config/consumer-overrides';
import { BIT_JSONC, DEFAULT_LANGUAGE, COMPILER_ENV_TYPE } from '../../constants';
import { PathOsBased, PathOsBasedAbsolute } from '../../utils/path';
import InvalidConfigFile from './exceptions/invalid-config-file';
import DataToPersist from '../../consumer/component/sources/data-to-persist';
import { AbstractVinyl } from '../../consumer/component/sources';
import { Compilers, Testers } from '../../consumer/config/abstract-config';
import { WorkspaceSettings, WorkspaceSettingsProps } from './workspace-settings';

import { EnvType } from '../../legacy-extensions/env-extension-types';
import { BitId } from '../../bit-id';
import { isFeatureEnabled } from '../../api/consumer/lib/feature-toggle';
import logger from '../../logger/logger';

const COMPONENT_CONFIG_ENTRY_NAME = 'variants';
const INTERNAL_CONFIG_PROPS = ['$schema', COMPONENT_CONFIG_ENTRY_NAME];

export type WorkspaceConfigFileInputProps = {
  workspace: WorkspaceSettingsProps;
  components?: ConsumerOverrides;
};
export type WorkspaceConfigFileProps = {
  $schema: string;
  $schemaVersion: string;
} & WorkspaceConfigFileInputProps;

export default class WorkspaceConfig {
  _path?: string;
  // Return only the configs that are workspace related (without components configs or schema definition)
  workspaceSettings: WorkspaceSettings;

  constructor(private data?: WorkspaceConfigFileProps, private legacyConfig?: LegacyWorkspaceConfig) {
    if (data) {
      const withoutInternalConfig = omit(INTERNAL_CONFIG_PROPS, data);
      this.workspaceSettings = WorkspaceSettings.fromObject(withoutInternalConfig);
      // } else if (legacyConfig){
    } else {
      // We know we have either data or legacy config
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.workspaceSettings = WorkspaceSettings.fromLegacyConfig(legacyConfig!);
    }
  }

  get path(): PathOsBased {
    return this._path || this.legacyConfig?.path || '';
  }

  set path(configPath: PathOsBased) {
    this._path = configPath;
  }

  get lang(): string {
    return this.legacyConfig?.lang || DEFAULT_LANGUAGE;
  }

  get _compiler(): Compilers | undefined {
    return this.legacyConfig?.compiler;
  }

  _setCompiler(compiler) {
    if (this.legacyConfig) {
      this.legacyConfig.compiler = compiler;
    }
  }

  get _tester(): Testers | undefined {
    return this.legacyConfig?.tester;
  }

  _setTester(tester) {
    if (this.legacyConfig) {
      this.legacyConfig.tester = tester;
    }
  }

  _getEnvsByType(type: EnvType): Compilers | Testers | undefined {
    if (type === COMPILER_ENV_TYPE) {
      return this.legacyConfig?.compiler;
    }
    return this.legacyConfig?.tester;
  }

  /**
   * Return the components section of the config file
   *
   * @readonly
   * @memberof WorkspaceConfig
   */
  get componentsConfig(): ConsumerOverrides | undefined {
    if (this.data) {
      return ConsumerOverrides.load(this.data.components);
    }
    // legacy configs
    return this.legacyConfig?.overrides;
  }

  getComponentConfig(componentId: BitId): ConsumerOverridesOfComponent {
    const componentsConfig = this.componentsConfig;
    const config = componentsConfig?.getOverrideComponentData(componentId) || {};

    const plainLegacy = this._legacyPlainObject();
    // Update envs from the root workspace object in case of legacy workspace config
    if (plainLegacy) {
      config.env = config.env || {};
      config.env.compiler = config.env.compiler || plainLegacy.env.compiler;
      config.env.tester = config.env.tester || plainLegacy.env.tester;
    }
    return config;
  }

  getExtensionConfig(extensionId: string) {
    return this.workspaceSettings.getExtensionConfig(extensionId);
  }

  /**
   * Create an instance of the WorkspaceConfig by an instance of the legacy config
   *
   * @static
   * @param {*} legacyConfig
   * @returns
   * @memberof WorkspaceConfig
   */
  static fromLegacyConfig(legacyConfig) {
    return new WorkspaceConfig(undefined, legacyConfig);
  }

  /**
   * Create an instance of the WorkspaceConfig by data
   *
   * @static
   * @param {WorkspaceConfigFileProps} data
   * @returns
   * @memberof WorkspaceConfig
   */
  static fromObject(data: WorkspaceConfigFileProps) {
    return new WorkspaceConfig(data, undefined);
  }

  /**
   * Create an instance of the WorkspaceConfig by the workspace config template and override values
   *
   * @static
   * @param {WorkspaceConfigFileProps} data values to override in the default template
   * @returns
   * @memberof WorkspaceConfig
   */
  static async create(props: WorkspaceConfigFileInputProps, dirPath?: PathOsBasedAbsolute) {
    if (isFeatureEnabled('legacy-workspace-config') && dirPath) {
      // Only support here what needed for e2e tests
      const legacyProps = {
        packageManager: props?.workspace?.dependencyResolver?.packageManager,
        componentsDefaultDirectory: props?.workspace?.workspace.defaultDirectory
      };
      const legacyConfig = await LegacyWorkspaceConfig.ensure(dirPath, false, legacyProps);
      const instance = this.fromLegacyConfig(legacyConfig);
      return instance;
    }
    const templateStr = fs.readFileSync(path.join(__dirname, './workspace-template.jsonc')).toString();
    const template = parse(templateStr);
    const merged = assign(template, props);
    const instance = new WorkspaceConfig(merged, undefined);
    if (dirPath) {
      instance.path = this.composeBitJsoncPath(dirPath);
    }
    return instance;
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
    workspaceConfigProps: WorkspaceConfigFileInputProps = {} as any
  ): Promise<WorkspaceConfig> {
    let workspaceConfig = await this.loadIfExist(dirPath);
    if (workspaceConfig) {
      return workspaceConfig;
    }
    workspaceConfig = await this.create(workspaceConfigProps, dirPath);
    return workspaceConfig;
  }

  static async reset(dirPath: PathOsBasedAbsolute, resetHard: boolean): Promise<void> {
    const bitJsoncPath = this.composeBitJsoncPath(dirPath);
    if (bitJsoncPath && resetHard) {
      logger.info(`deleting the consumer bit.jsonc file at ${bitJsoncPath}`);
      await fs.remove(bitJsoncPath);
      return;
    }
    LegacyWorkspaceConfig.reset(dirPath, resetHard);
  }

  /**
   * Get the path of the bit.jsonc file by a containing folder
   *
   * @static
   * @param {PathOsBased} dirPath containing dir of the bit.jsonc file
   * @returns {PathOsBased}
   * @memberof WorkspaceConfig
   */
  static composeBitJsoncPath(dirPath: PathOsBased): PathOsBased {
    return path.join(dirPath, BIT_JSONC);
  }

  static async pathHasBitJsonc(dirPath: PathOsBased): Promise<boolean> {
    return fs.pathExists(this.composeBitJsoncPath(dirPath));
  }

  /**
   * Load the workspace configuration if it's exist
   *
   * @static
   * @param {PathOsBased} dirPath
   * @returns {(Promise<WorkspaceConfig | undefined>)}
   * @memberof WorkspaceConfig
   */
  static async loadIfExist(dirPath: PathOsBased): Promise<WorkspaceConfig | undefined> {
    const jsoncExist = await this.pathHasBitJsonc(dirPath);
    if (jsoncExist) {
      const jsoncPath = this.composeBitJsoncPath(dirPath);
      const instance = await this._loadFromBitJsonc(jsoncPath);
      instance.path = jsoncPath;
      return instance;
    }
    const legacyConfig = await LegacyWorkspaceConfig.loadIfExist(dirPath);
    if (legacyConfig) {
      return this.fromLegacyConfig(legacyConfig);
    }
    return undefined;
  }

  static async _loadFromBitJsonc(bitJsoncPath: PathOsBased): Promise<WorkspaceConfig> {
    const contentBuffer = await fs.readFile(bitJsoncPath);
    try {
      const parsed = parse(contentBuffer.toString());
      return this.fromObject(parsed);
    } catch (e) {
      throw new InvalidConfigFile(bitJsoncPath);
    }
  }

  async write({ workspaceDir }: { workspaceDir: PathOsBasedAbsolute }): Promise<void> {
    if (this.data) {
      const files = await this.toVinyl(workspaceDir);
      const dataToPersist = new DataToPersist();
      if (files) {
        dataToPersist.addManyFiles(files);
        return dataToPersist.persistAllToFS();
      }
    }
    await this.legacyConfig?.write({ workspaceDir });
    return undefined;
  }

  async toVinyl(workspaceDir: PathOsBasedAbsolute): Promise<AbstractVinyl[] | undefined> {
    if (this.data) {
      const jsonStr = stringify(this.data, undefined, 2);
      const base = workspaceDir;
      const fullPath = workspaceDir ? WorkspaceConfig.composeBitJsoncPath(workspaceDir) : this.path;
      const jsonFile = new AbstractVinyl({ base, path: fullPath, contents: Buffer.from(jsonStr) });
      return [jsonFile];
    }
    return this.legacyConfig?.toVinyl({ workspaceDir });
  }

  _legacyPlainObject(): { [prop: string]: any } | undefined {
    if (this.legacyConfig) {
      return this.legacyConfig.toPlainObject();
    }
    return undefined;
  }

  /**
   * Returns object with configs per extensions
   *
   * @memberof WorkspaceConfig
   */
  getCoreExtensionsConfig(): { [extensionName: string]: any } {
    const workspaceConfig = this.workspaceSettings;
    // TODO: take it somehow from harmony that should get it by the workspace extension manifest
    const workspaceExtPropNames = ['defaultScope', 'componentsDefaultDirectory'];
    const workspaceExtProps = pick(workspaceExtPropNames, workspaceConfig);
    const result = omit(workspaceExtPropNames, workspaceConfig);
    result.workspace = workspaceExtProps;
    return result;
  }
}
