/** @flow */
import R from 'ramda';
import AbstractConfig from './abstract-config';
import type { Compilers, Testers } from './abstract-config';
import type WorkspaceConfig from './workspace-config';
import type { PathOsBasedAbsolute, PathOsBasedRelative } from '../../utils/path';
import type Component from '../component/consumer-component';
import GeneralError from '../../error/general-error';
import type { ComponentOverridesData } from './component-overrides';
import filterObject from '../../utils/filter-object';
import PackageJsonFile from '../component/package-json-file';

type ConfigProps = {
  lang?: string,
  compiler?: string | Compilers,
  tester?: string | Testers,
  bindingPrefix: string,
  extensions?: Object,
  overrides?: ComponentOverridesData
};

export default class ComponentConfig extends AbstractConfig {
  overrides: ?ComponentOverridesData;
  componentHasWrittenConfig: boolean = false; // whether a component has bit.json written to FS or package.json written with 'bit' property
  packageJsonFile: ?PackageJsonFile;
  constructor({ compiler, tester, lang, bindingPrefix, extensions, overrides }: ConfigProps) {
    super({
      compiler,
      tester,
      lang,
      bindingPrefix,
      extensions
    });
    this.overrides = overrides;
    this.writeToBitJson = true; // will be changed later to work similar to workspace-config
  }

  toPlainObject() {
    const superObject = super.toPlainObject();
    const componentObject = R.merge(superObject, {
      overrides: this.overrides
    });
    const isPropDefaultOrEmpty = (val, key) => {
      if (key === 'overrides') return !R.isEmpty(val);
      return true;
    };
    return filterObject(componentObject, isPropDefaultOrEmpty);
  }

  validate(bitJsonPath: string) {
    if (
      typeof this.compiler !== 'object' ||
      typeof this.tester !== 'object' ||
      (this.extensions() && typeof this.extensions() !== 'object')
    ) {
      throw new GeneralError(
        `bit.json at "${bitJsonPath}" is invalid, re-import the component with "--conf" flag to recreate it`
      );
    }
  }

  static fromPlainObject(object: Object): ComponentConfig {
    const { env, lang, bindingPrefix, extensions, overrides } = object;

    return new ComponentConfig({
      compiler: R.prop('compiler', env),
      tester: R.prop('tester', env),
      extensions,
      lang,
      bindingPrefix,
      overrides
    });
  }

  static fromComponent(component: Component): ComponentConfig {
    return new ComponentConfig({
      version: component.version,
      scope: component.scope,
      lang: component.lang,
      bindingPrefix: component.bindingPrefix,
      compiler: component.compiler || {},
      tester: component.tester || {},
      overrides: component.overrides.componentOverridesData
    });
  }

  mergeWithComponentData(component: Component) {
    this.bindingPrefix = this.bindingPrefix || component.bindingPrefix;
    this.lang = this.lang || component.lang;
  }

  /**
   * Use the workspaceConfig as a base. Override values if exist in componentConfig
   */
  static mergeWithWorkspaceConfig(componentConfig: Object, consumerConfig: ?WorkspaceConfig): ComponentConfig {
    const plainConsumerConfig = consumerConfig ? consumerConfig.toPlainObject() : {};
    return ComponentConfig.fromPlainObject(R.merge(plainConsumerConfig, componentConfig));
  }

  /**
   * component config is written by default to package.json inside "bit" property.
   * in case "eject-conf" was running or the component was imported with "--conf" flag, the
   * bit.json is written as well.
   *
   * @param {*} componentDir root component directory, needed for loading package.json file.
   * in case a component is authored, leave this param empty to not load the project package.json
   * @param {*} configDir dir where bit.json and other envs files are written (by eject-conf or import --conf)
   * @param {*} workspaceConfig
   */
  static async load({
    componentDir,
    workspaceDir,
    configDir,
    workspaceConfig
  }: {
    componentDir: ?PathOsBasedRelative,
    workspaceDir: PathOsBasedRelative,
    configDir: PathOsBasedAbsolute,
    workspaceConfig: WorkspaceConfig
  }): Promise<ComponentConfig> {
    if (!configDir) throw new TypeError('component-config.load configDir arg is empty');
    const bitJsonPath = AbstractConfig.composeBitJsonPath(configDir);
    const loadBitJson = async () => {
      try {
        const file = await AbstractConfig.loadJsonFileIfExist(bitJsonPath);
        return file;
      } catch (e) {
        throw new GeneralError(
          `bit.json at "${bitJsonPath}" is not a valid JSON file, re-import the component with "--conf" flag to recreate it`
        );
      }
    };
    const loadPackageJson = async (): Promise<?PackageJsonFile> => {
      if (!componentDir) return null;
      try {
        const file = await PackageJsonFile.load(workspaceDir, componentDir);
        if (!file.fileExist) return null;
        return file;
      } catch (e) {
        throw new GeneralError(
          `package.json at ${AbstractConfig.composePackageJsonPath(
            componentDir
          )} is not a valid JSON file, consider to re-import the file to re-generate the file`
        );
      }
    };
    const [bitJsonFile, packageJsonFile] = await Promise.all([loadBitJson(), loadPackageJson()]);
    const bitJsonConfig = bitJsonFile || {};
    const packageJsonObject = packageJsonFile ? packageJsonFile.packageJsonObject : null;
    const packageJsonHasConfig = Boolean(packageJsonObject && packageJsonObject.bit);
    const packageJsonConfig = packageJsonHasConfig ? packageJsonObject.bit : {};
    // in case of conflicts, bit.json wins package.json
    const config = Object.assign(packageJsonConfig, bitJsonConfig);
    const componentConfig = ComponentConfig.mergeWithWorkspaceConfig(config, workspaceConfig);
    componentConfig.path = bitJsonPath;
    componentConfig.componentHasWrittenConfig = packageJsonHasConfig || Boolean(bitJsonFile);
    componentConfig.packageJsonFile = packageJsonFile;
    return componentConfig;
  }
}
