import * as path from 'path';
import * as fs from 'fs-extra';
import { parse, stringify, assign } from 'comment-json';
import LegacyWorkspaceConfig from '../../consumer/config/workspace-config';
import { BIT_JSONC } from '../../constants';
import { PathOsBased } from '../../utils/path';
import { throws } from 'assert';
import InvalidConfigFile from './exceptions/invalid-config-file';

interface WorkspaceConfigProps {}

export default class WorkspaceConfig {
  _path?: string;

  constructor(private data?: WorkspaceConfigProps, private legacyConfig?: LegacyWorkspaceConfig) {}

  get path(): PathOsBased | undefined {
    return this._path || this.legacyConfig?.path;
  }

  set path(configPath: PathOsBased) {
    this._path = configPath;
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
   * @param {WorkspaceConfigProps} data
   * @returns
   * @memberof WorkspaceConfig
   */
  static fromObject(data: WorkspaceConfigProps) {
    return new WorkspaceConfig(data, undefined);
  }

  /**
   * Create an instance of the WorkspaceConfig by the workspace config template and override values
   *
   * @static
   * @param {WorkspaceConfigProps} data values to override in the default template
   * @returns
   * @memberof WorkspaceConfig
   */
  static create(data: WorkspaceConfigProps) {
    const templateStr = fs.readFileSync(path.join(__dirname, './workspace-template.jsonc')).toString();
    const template = parse(templateStr);
    const merged = assign(template, data);
    return new WorkspaceConfig(merged, undefined);
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

  /**
   * Returns object with configs per extensions
   *
   * @memberof WorkspaceConfig
   */
  getCoreExtensionsConfig(): { [extensionName: string]: any } {}
}
