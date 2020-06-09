import pMapSeries from 'p-map-series';
import R from 'ramda';
import AbstractConfig from './abstract-config';
import { Compilers, Testers } from './abstract-config';
import logger from '../../logger/logger';
import { PathOsBasedRelative, PathOsBasedAbsolute } from '../../utils/path';
import Component from '../component/consumer-component';
import { ComponentOverridesData } from './component-overrides';
import filterObject from '../../utils/filter-object';
import PackageJsonFile from '../component/package-json-file';
import ShowDoctorError from '../../error/show-doctor-error';
import { BitId } from '../../bit-id';
import { Consumer } from '..';
import { ExtensionDataList } from './extension-data';
import { ILegacyWorkspaceConfig } from './legacy-workspace-config-interface';
import { DEFAULT_REGISTRY_DOMAIN_PREFIX } from '../../constants';

type ConfigProps = {
  lang?: string;
  compiler?: string | Compilers;
  tester?: string | Testers;
  bindingPrefix: string;
  extensions?: ExtensionDataList;
  overrides?: ComponentOverridesData;
};

type ConfigLoadRegistry = { [extId: string]: Function };
type AddConfigRegistry = { [extId: string]: Function };

export default class ComponentConfig extends AbstractConfig {
  overrides: ComponentOverridesData | null | undefined;
  componentHasWrittenConfig = false; // whether a component has bit.json written to FS or package.json written with 'bit' property
  packageJsonFile: PackageJsonFile | null | undefined;
  extensionsAddedConfig: { [prop: string]: any } | undefined;

  static componentConfigLoadingRegistry: ConfigLoadRegistry = {};
  static registerOnComponentConfigLoading(extId, func: (id, config) => any) {
    this.componentConfigLoadingRegistry[extId] = func;
  }
  static addConfigRegistry: AddConfigRegistry = {};
  static registerAddConfigAction(extId, func: (extensions: ExtensionDataList) => any) {
    this.addConfigRegistry[extId] = func;
  }

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
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      (this.extensions() && typeof this.extensions() !== 'object')
    ) {
      throw new ShowDoctorError(
        `bit.json at "${bitJsonPath}" is invalid, re-import the component with "--conf" flag to recreate it`
      );
    }
  }

  /**
   * Return the extensions as ExtensionDataList
   *
   * @returns {ExtensionDataList}
   * @memberof ComponentConfig
   */
  parseExtensions(): ExtensionDataList {
    return ExtensionDataList.fromArray(this.extensions);
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

    // TODO: run runOnLoadEvent
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

    // TODO: run runOnLoadEvent
  }

  mergeWithComponentData(component: Component) {
    this.bindingPrefix = this.bindingPrefix || component.bindingPrefix;
    this.lang = this.lang || component.lang;
    this.extensions = this.extensions.length ? this.extensions : component.extensions;
  }

  /**
   * Use the workspaceConfig as a base. Override values if exist in componentConfig
   * This only used for legacy props that were defined in the root like compiler / tester
   */
  static mergeWithWorkspaceRootConfigs(
    consumer: Consumer,
    componentId: BitId,
    componentConfig: Record<string, any>,
    workspaceConfig: ILegacyWorkspaceConfig | undefined
  ): ComponentConfig {
    const plainWorkspaceConfig = workspaceConfig ? workspaceConfig._legacyPlainObject() : undefined;
    let legacyWorkspaceConfigToMerge = {};
    if (plainWorkspaceConfig) {
      legacyWorkspaceConfigToMerge = filterObject(plainWorkspaceConfig, (val, key) => key !== 'overrides');
    }
    const componentConfigFromWorkspaceToMerge = workspaceConfig?.getComponentConfig(componentId) || {};
    const defaultOwner = workspaceConfig?.defaultOwner;

    if (defaultOwner && defaultOwner !== DEFAULT_REGISTRY_DOMAIN_PREFIX) {
      componentConfigFromWorkspaceToMerge.bindingPrefix = defaultOwner.startsWith('@')
        ? defaultOwner
        : `@${defaultOwner}`;
    }
    const mergedObject = R.mergeAll([
      legacyWorkspaceConfigToMerge,
      componentConfigFromWorkspaceToMerge,
      componentConfig
    ]);
    mergedObject.extensions = ExtensionDataList.fromObject(mergedObject.extensions, consumer);
    // Do not try to load extension for itself (usually happen when using '*' pattern)
    mergedObject.extensions = mergedObject.extensions.remove(componentId);
    return ComponentConfig.fromPlainObject(mergedObject);
  }

  /**
   * component config is written by default to package.json inside "bit" property.
   * in case "eject-conf" was running or the component was imported with "--conf" flag, the
   * bit.json is written as well.
   *
   * @param {*} componentDir root component directory, needed for loading package.json file.
   * in case a component is authored, leave this param empty to not load the project package.json
   * @param {*} workspaceConfig
   */
  static async loadConfigFromFolder({
    componentDir,
    workspaceDir
  }: {
    componentDir: PathOsBasedAbsolute | undefined;
    workspaceDir: PathOsBasedAbsolute;
  }): Promise<{ componentHasWrittenConfig: boolean; config: any; packageJsonFile: any; bitJsonPath: string }> {
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
    return {
      config,
      bitJsonPath,
      packageJsonFile,
      componentHasWrittenConfig
    };
  }

  /**
   * component config is written by default to package.json inside "bit" property.
   * in case "eject-conf" was running or the component was imported with "--conf" flag, the
   * bit.json is written as well.
   *
   * @param {*} componentDir root component directory, needed for loading package.json file.
   * in case a component is authored, leave this param empty to not load the project package.json
   * @param {*} workspaceConfig
   */
  static async load({
    consumer,
    componentId,
    componentDir,
    workspaceDir,
    workspaceConfig
  }: {
    consumer: Consumer;
    componentId: BitId;
    componentDir: PathOsBasedRelative | undefined;
    workspaceDir: PathOsBasedRelative;
    workspaceConfig: ILegacyWorkspaceConfig;
  }): Promise<ComponentConfig> {
    const { config, bitJsonPath, packageJsonFile, componentHasWrittenConfig } = await this.loadConfigFromFolder({
      componentDir,
      workspaceDir
    });
    const componentConfig = ComponentConfig.mergeWithWorkspaceRootConfigs(
      consumer,
      componentId,
      config,
      workspaceConfig
    );

    componentConfig.path = bitJsonPath;

    await this.runOnLoadEvent(this.componentConfigLoadingRegistry, componentId, componentConfig);
    const extensionsAddedConfig = await runOnAddConfigEvent(this.addConfigRegistry, componentConfig.parseExtensions());

    componentConfig.extensionsAddedConfig = extensionsAddedConfig;

    componentConfig.componentHasWrittenConfig = componentHasWrittenConfig;
    // @ts-ignore seems to be a bug in ts v3.7.x, it doesn't recognize Promise.all array correctly
    componentConfig.packageJsonFile = packageJsonFile;
    return componentConfig;
  }

  /**
   * Run all subscribers to the component config load event
   *
   * @static
   * @param {ConfigLoadRegistry} componentConfigLoadingRegistry
   * @param {BitId} id
   * @param {*} config
   * @memberof ComponentConfig
   */
  static async runOnLoadEvent(componentConfigLoadingRegistry: ConfigLoadRegistry, id: BitId, config: any) {
    try {
      await pMapSeries(Object.keys(componentConfigLoadingRegistry), async (extId: string) => {
        const func = componentConfigLoadingRegistry[extId];
        return func(id, config);
      });
    } catch (err) {
      // TODO: improve texts
      logger.console(`\nfailed loading an extension for component ${id.toString()}, error is:`, 'warn', 'yellow');
      // TODO: this show an ugly error, we should somehow show a proper errors
      logger.console(err, 'warn', 'yellow');
      logger.console('the error has been ignored', 'warn', 'yellow');
      logger.warn('extension on load event throw an error', err);
    }
  }
}

/**
 * Runs all the functions from the registry and merged their results
 *
 * @param {AddConfigRegistry} configsRegistry
 * @returns {Promise<any>} A merge results of the added config by all the extensions
 */
async function runOnAddConfigEvent(configsRegistry: AddConfigRegistry, extensions: ExtensionDataList): Promise<any> {
  const extensionsConfigModificationsP = Object.keys(configsRegistry).map(extId => {
    // TODO: only running func for relevant extensions
    const func = configsRegistry[extId];
    return func(extensions);
  });
  const extensionsConfigModifications = await Promise.all(extensionsConfigModificationsP);
  const extensionsConfigModificationsObject = mergeExtensionsConfig(extensionsConfigModifications);
  return extensionsConfigModificationsObject;
}

/**
 * Merge added configs from many extensions
 *
 * @param {any[]} configs
 * @returns A merge results of all config
 */
function mergeExtensionsConfig(configs: any[]): any {
  return configs.reduce((prev, curr) => {
    return R.mergeDeepLeft(prev, curr);
  }, {});
}
