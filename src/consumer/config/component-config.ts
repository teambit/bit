import R from 'ramda';
import AbstractConfig from './abstract-config';
import { Compilers, Testers } from './abstract-config';
import { WorkspaceConfig } from '../../extensions/workspace-config';
import { PathOsBasedRelative } from '../../utils/path';
import Component, { ExtensionData } from '../component/consumer-component';
import { ComponentOverridesData } from './component-overrides';
import filterObject from '../../utils/filter-object';
import PackageJsonFile from '../component/package-json-file';
import ShowDoctorError from '../../error/show-doctor-error';
import { BitId } from '../../bit-id';
import { Consumer } from '..';

type ConfigProps = {
  lang?: string;
  compiler?: string | Compilers;
  tester?: string | Testers;
  bindingPrefix: string;
  extensions?: Record<string, any>;
  overrides?: ComponentOverridesData;
};

export default class ComponentConfig extends AbstractConfig {
  overrides: ComponentOverridesData | null | undefined;
  componentHasWrittenConfig = false; // whether a component has bit.json written to FS or package.json written with 'bit' property
  packageJsonFile: PackageJsonFile | null | undefined;
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

  parsedExtensions(consumer: Consumer, currentId: BitId): ExtensionData[] {
    const res: ExtensionData[] = [];
    R.forEachObjIndexed((extConfig, extName) => {
      const extensionId = consumer.getParsedIdIfExist(extName);
      // Store config for core extensions
      if (!extensionId) {
        res.push({ name: extName, config: extConfig });
        // Do not put the extension inside the extension itself
      } else if (currentId.name !== extensionId.name) {
        res.push({ extensionId, config: extConfig });
      }
    }, this.extensions);
    return res;
  }

  validate(bitJsonPath: string) {
    if (
      typeof this.compiler !== 'object' ||
      typeof this.tester !== 'object' ||
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      (this.extensions() && typeof this.extensions() !== 'object')
    ) {
      throw new ShowDoctorError(
        `bit.json at "${bitJsonPath}" is invalid, re-import the component with "--conf" flag to recreate it`
      );
    }
  }

  static fromPlainObject(object: Record<string, any>): ComponentConfig {
    const { env, lang, bindingPrefix, extensions, overrides } = object;

    return new ComponentConfig({
      compiler: env ? R.prop('compiler', env) : undefined,
      tester: env ? R.prop('tester', env) : undefined,
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
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      compiler: component.compiler || {},
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
   * This only used for legacy props that were defined in the root like compiler / tester
   */
  static mergeWithWorkspaceRootConfigs(
    componentConfig: Record<string, any>,
    workspaceConfig: WorkspaceConfig | undefined
  ): ComponentConfig {
    let plainWorkspaceConfig = workspaceConfig ? workspaceConfig.toPlainObject() : {};
    plainWorkspaceConfig = plainWorkspaceConfig || {};
    const workspaceConfigWithoutConsumerSpecifics = filterObject(
      plainWorkspaceConfig,
      (val, key) => key !== 'overrides'
    );
    const mergedObject = R.merge(workspaceConfigWithoutConsumerSpecifics, componentConfig);
    return ComponentConfig.fromPlainObject(mergedObject);
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
    workspaceConfig
  }: {
    componentDir: PathOsBasedRelative | undefined;
    workspaceDir: PathOsBasedRelative;
    workspaceConfig: WorkspaceConfig;
  }): Promise<ComponentConfig> {
    let bitJsonPath;
    let componentHasWrittenConfig = false;
    let packageJsonFile;
    if (componentDir) {
      bitJsonPath = AbstractConfig.composeBitJsonPath(componentDir);
    }
    const loadBitJson = async () => {
      if (!bitJsonPath) {
        return {};
      }
      try {
        const file = await AbstractConfig.loadJsonFileIfExist(bitJsonPath);
        if (file) {
          componentHasWrittenConfig = true;
          return file;
        }
        return {};
      } catch (e) {
        throw new ShowDoctorError(
          `bit.json at "${bitJsonPath}" is not a valid JSON file, re-import the component with "--conf" flag to recreate it`
        );
      }
    };
    const loadPackageJson = async (): Promise<PackageJsonFile | {}> => {
      if (!componentDir) return {};
      try {
        const file = await PackageJsonFile.load(workspaceDir, componentDir);
        packageJsonFile = file;
        const packageJsonObject = file.fileExist ? file.packageJsonObject : undefined;
        const packageJsonHasConfig = Boolean(packageJsonObject && packageJsonObject.bit);
        if (packageJsonHasConfig) {
          const packageJsonConfig = packageJsonObject?.bit;
          componentHasWrittenConfig = true;
          return packageJsonConfig;
        }
        return {};
      } catch (e) {
        throw new ShowDoctorError(
          `package.json at ${AbstractConfig.composePackageJsonPath(
            componentDir
          )} is not a valid JSON file, consider to re-import the file to re-generate the file`
        );
      }
    };
    const [bitJsonConfig, packageJsonConfig] = await Promise.all([loadBitJson(), loadPackageJson()]);
    // in case of conflicts, bit.json wins package.json
    const config = Object.assign(packageJsonConfig, bitJsonConfig);
    const componentConfig = ComponentConfig.mergeWithWorkspaceRootConfigs(config, workspaceConfig);
    componentConfig.path = bitJsonPath;
    componentConfig.componentHasWrittenConfig = componentHasWrittenConfig;
    // @ts-ignore seems to be a bug in ts v3.7.x, it doesn't recognize Promise.all array correctly
    componentConfig.packageJsonFile = packageJsonFile;
    return componentConfig;
  }
}
