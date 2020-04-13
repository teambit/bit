import R from 'ramda';
import AbstractConfig from './abstract-config';
import { Compilers, Testers } from './abstract-config';
import { WorkspaceConfig } from '../../extensions/workspace-config';
import { PathOsBasedRelative } from '../../utils/path';
import Component from '../component/consumer-component';
import { ComponentOverridesData } from './component-overrides';
import filterObject from '../../utils/filter-object';
import PackageJsonFile from '../component/package-json-file';
import ShowDoctorError from '../../error/show-doctor-error';
import { BitId } from '../../bit-id';
import { Consumer } from '..';
import logger from '../../logger/logger';
import { ExtensionDataList } from './extension-data';

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
  static registerAddConfigAction(extId, func: () => any) {
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
   * Return extension defined by the user and by other extensions
   *
   * @returns {ExtensionDataList}
   * @memberof ComponentConfig
   */
  allExtensions(): ExtensionDataList {
    if (!this.extensionsAddedConfig || !this.extensionsAddedConfig.extensions) {
      return this.extensions;
    }
    return ExtensionDataList.fromArray([...this.extensionsAddedConfig.extensions, ...this.extensions]);
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
    workspaceConfig: WorkspaceConfig | undefined
  ): ComponentConfig {
    const plainWorkspaceConfig = workspaceConfig ? workspaceConfig._legacyPlainObject() : undefined;
    let workspaceConfigToMerge;
    if (plainWorkspaceConfig) {
      workspaceConfigToMerge = filterObject(plainWorkspaceConfig, (val, key) => key !== 'overrides');
    } else {
      workspaceConfigToMerge = workspaceConfig?.getComponentConfig(componentId);
    }
    const mergedObject = R.merge(workspaceConfigToMerge, componentConfig);
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
    const componentConfig = ComponentConfig.mergeWithWorkspaceRootConfigs(
      consumer,
      componentId,
      config,
      workspaceConfig
    );

    componentConfig.path = bitJsonPath;
    await this.recursivelyRunOnLoadEvent(
      componentId,
      consumer,
      this.componentConfigLoadingRegistry,
      componentConfig,
      [],
      {}
    );
    if (componentConfig.extensionsAddedConfig?.extensions) {
      componentConfig.extensionsAddedConfig.extensions = ExtensionDataList.fromObject(
        componentConfig.extensionsAddedConfig?.extensions.extensions,
        consumer
      );
    }
    componentConfig.componentHasWrittenConfig = componentHasWrittenConfig;
    // @ts-ignore seems to be a bug in ts v3.7.x, it doesn't recognize Promise.all array correctly
    componentConfig.packageJsonFile = packageJsonFile;
    return componentConfig;
  }

  // TODO: Refactor this function, it's very complicated

  /**
   * This will run the on load event recursively
   * It will check if an extension added another extension that not yet loaded and if yes will re-trigger
   * the on load even (to give the possibility for new extension to register to add their own config for the component)
   * For example extension1 add extension2. and extension2 want's to add new config to the component (maybe even another extension)
   *
   * This method mutate the config during the process!!!
   *
   * @static
   * @param {BitId} id The component id
   * @param {Consumer} consumer
   * @param {ConfigLoadRegistry} componentConfigLoadingRegistry all subscribers to the config load event
   * @param {ComponentConfig} config The config calculated by the component package.json, models and workspace config (without the extensions added config)
   * @param {string[]} [alreadyLoadedExtensions=[]] Extensions that already loaded (and run the addConfig event) as part of the process
   * @param {*} accumulativeAddedConfig An accumulator of the config added by all the extensions loaded so far
   * @returns {Promise<any>}
   * @memberof ComponentConfig
   */
  static async recursivelyRunOnLoadEvent(
    id: BitId,
    consumer: Consumer,
    componentConfigLoadingRegistry: ConfigLoadRegistry,
    config: ComponentConfig,
    alreadyLoadedExtensions: string[] = [],
    accumulativeAddedConfig: any
  ): Promise<any> {
    await this.runOnLoadEvent(componentConfigLoadingRegistry, id, config);
    // We should only ask for new config from extension applied on the component
    // (added to the variant by the user or added by one of those extension)
    const extensionsAppliedOnTheComponent = config.allExtensions().ids;
    // The registry is singleton for all component so we need to filter it by extension relevant for the component
    const AddConfigRegistryForComponentOnly = R.pick(extensionsAppliedOnTheComponent, this.addConfigRegistry);
    // No reason to run the function for extension already loaded (prevent infinite loops and performance issues)
    const AddConfigRegistryWithoutAlreadyLoadedAndSelf = R.omit(
      [...alreadyLoadedExtensions, id.toString()],
      AddConfigRegistryForComponentOnly
    );
    const extensionsAddedConfig = await getConfigFromExtensions(
      // Taking it from the class itself since extensions that added by extension might change it
      AddConfigRegistryWithoutAlreadyLoadedAndSelf
    );
    const addedExtension = extensionsAddedConfig.extensions ? Object.keys(extensionsAddedConfig.extensions) : [];
    const newExtensions = R.difference(addedExtension, alreadyLoadedExtensions);
    const mergedAddedConfig = mergeExtensionsConfig([extensionsAddedConfig, accumulativeAddedConfig]);
    // Mutate the real config since there are events who need on updated config
    // We clone it because we need the original one to stay in the original format
    config.extensionsAddedConfig = R.clone(mergedAddedConfig);
    // TODO: move this transformation into the mergedAddedConfig object
    // It doesn't run on the merged because then the mergeExtensionsConfig will break next time
    // we should support merging ExtensionDataList as well
    if (config.extensionsAddedConfig?.extensions) {
      config.extensionsAddedConfig.extensions = ExtensionDataList.fromObject(
        config.extensionsAddedConfig.extensions,
        consumer
      );
    }
    // There are new extension needed to be load
    if (newExtensions.length) {
      // const mergedExtensions = alreadyLoadedExtensions.concat(newExtensions);
      const justLoadedExtensions = Object.keys(AddConfigRegistryWithoutAlreadyLoadedAndSelf);
      alreadyLoadedExtensions = alreadyLoadedExtensions.concat(justLoadedExtensions);
      return this.recursivelyRunOnLoadEvent(
        id,
        consumer,
        componentConfigLoadingRegistry,
        config,
        alreadyLoadedExtensions,
        mergedAddedConfig
      );
    }
    return mergedAddedConfig;
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
    const onLoadSubscribersP = Object.keys(componentConfigLoadingRegistry).map(async extId => {
      const func = componentConfigLoadingRegistry[extId];
      return func(id, config);
    });
    try {
      await Promise.all(onLoadSubscribersP);
    } catch (err) {
      logger.warn('extension on load event throw an error');
      logger.warn(err);
    }
  }
}

/**
 * Runs all the functions from the registry and merged their results
 *
 * @param {AddConfigRegistry} configsRegistry
 * @returns {Promise<any>} A merge results of the added config by all the extensions
 */
async function getConfigFromExtensions(configsRegistry: AddConfigRegistry): Promise<any> {
  const extensionsConfigModificationsP = Object.keys(configsRegistry).map(extId => {
    // TODO: only running func for relevant extensions
    const func = configsRegistry[extId];
    return func();
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
