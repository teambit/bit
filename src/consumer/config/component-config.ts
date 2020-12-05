import mapSeries from 'p-map-series';
import R from 'ramda';
import { Consumer } from '..';
import { BitId } from '../../bit-id';
import { DEFAULT_REGISTRY_DOMAIN_PREFIX } from '../../constants';
import ShowDoctorError from '../../error/show-doctor-error';
import logger from '../../logger/logger';
import filterObject from '../../utils/filter-object';
import { PathOsBasedAbsolute, PathOsBasedRelative } from '../../utils/path';
import Component from '../component/consumer-component';
import PackageJsonFile from '../component/package-json-file';
import AbstractConfig, { Compilers, Testers } from './abstract-config';
import { ComponentOverridesData } from './component-overrides';
import { ExtensionDataList } from './extension-data';
import { ILegacyWorkspaceConfig } from './legacy-workspace-config-interface';

type ConfigProps = {
  lang?: string;
  compiler?: string | Compilers;
  tester?: string | Testers;
  bindingPrefix: string;
  extensions?: ExtensionDataList;
  defaultScope?: string;
  overrides?: ComponentOverridesData;
};

type ConfigLoadRegistry = { [extId: string]: Function };
type ConfigLegacyLoadRegistry = { [extId: string]: Function };

// TODO: take for some other place like config
// TODO: unify this and the same in src/components/utils/load-extensions/load-resolved-extensions.ts
const ignoreLoadingExtensionsErrors = false;

export default class ComponentConfig extends AbstractConfig {
  overrides: ComponentOverridesData | null | undefined;
  defaultScope: string | undefined;
  componentHasWrittenConfig = false; // whether a component has bit.json written to FS or package.json written with 'bit' property
  packageJsonFile: PackageJsonFile | null | undefined;

  static componentConfigLoadingRegistry: ConfigLoadRegistry = {};
  static registerOnComponentConfigLoading(extId, func: (id) => any) {
    this.componentConfigLoadingRegistry[extId] = func;
  }
  static componentConfigLegacyLoadingRegistry: ConfigLegacyLoadRegistry = {};
  static registerOnComponentConfigLegacyLoading(extId, func: (id, config) => any) {
    this.componentConfigLegacyLoadingRegistry[extId] = func;
  }

  constructor({ compiler, tester, lang, bindingPrefix, extensions, defaultScope, overrides }: ConfigProps) {
    super({
      compiler,
      tester,
      lang,
      bindingPrefix,
      extensions,
    });
    this.defaultScope = defaultScope;
    this.overrides = overrides;
    this.writeToBitJson = true; // will be changed later to work similar to workspace-config
  }

  toPlainObject() {
    const superObject = super.toPlainObject();
    const componentObject = R.merge(superObject, {
      overrides: this.overrides,
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
    let parsedExtensions = new ExtensionDataList();
    if (!(extensions instanceof ExtensionDataList)) {
      if (Array.isArray(extensions)) {
        parsedExtensions = ExtensionDataList.fromArray(extensions);
      } else {
        parsedExtensions = ExtensionDataList.fromConfigObject(extensions);
      }
    }
    return new ComponentConfig({
      compiler: env ? R.prop('compiler', env) : undefined,
      tester: env ? R.prop('tester', env) : undefined,
      extensions: parsedExtensions,
      defaultScope: object.defaultScope,
      lang,
      bindingPrefix,
      overrides,
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
      overrides: component.overrides.componentOverridesData,
    });

    // TODO: run runOnLoadEvent
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
      componentConfig,
    ]);
    mergedObject.extensions = ExtensionDataList.fromConfigObject(mergedObject.extensions);
    // Do not try to load extension for itself (usually happen when using '*' pattern)
    mergedObject.extensions = mergedObject.extensions.remove(componentId);
    mergedObject.defaultScope = componentConfigFromWorkspaceToMerge?.defaultScope || workspaceConfig?.defaultScope;
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
    workspaceDir,
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
      componentHasWrittenConfig,
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
    workspaceConfig,
  }: {
    consumer: Consumer;
    componentId: BitId;
    componentDir: PathOsBasedRelative | undefined;
    workspaceDir: PathOsBasedRelative;
    workspaceConfig: ILegacyWorkspaceConfig;
  }): Promise<ComponentConfig> {
    let componentConfig;
    // Harmony project
    // TODO: consider loading legacy components in vendor folder as legacy instead of as harmony components
    if (!workspaceConfig.isLegacy) {
      const onLoadResults = await this.runOnLoadEvent(this.componentConfigLoadingRegistry, componentId);
      const wsComponentConfig = onLoadResults[0];
      const defaultScope = wsComponentConfig.defaultScope;
      const splittedScope = defaultScope.split('.');
      const defaultOwner = splittedScope.length === 1 ? defaultScope : splittedScope[0];
      let bindingPrefix = DEFAULT_REGISTRY_DOMAIN_PREFIX;
      if (defaultOwner && defaultOwner !== DEFAULT_REGISTRY_DOMAIN_PREFIX) {
        bindingPrefix = defaultOwner.startsWith('@') ? defaultOwner : `@${defaultOwner}`;
      }
      componentConfig = new ComponentConfig({
        extensions: wsComponentConfig.extensions,
        defaultScope,
        bindingPrefix,
      });
      // Legacy project
    } else {
      const { config, bitJsonPath, packageJsonFile, componentHasWrittenConfig } = await this.loadConfigFromFolder({
        componentDir,
        workspaceDir,
      });
      componentConfig = ComponentConfig.mergeWithWorkspaceRootConfigs(consumer, componentId, config, workspaceConfig);

      componentConfig.path = bitJsonPath;
      componentConfig.componentHasWrittenConfig = componentHasWrittenConfig;
      componentConfig.packageJsonFile = packageJsonFile;

      await this.runOnLegacyLoadEvent(this.componentConfigLegacyLoadingRegistry, componentId, componentConfig);
    }

    // @ts-ignore seems to be a bug in ts v3.7.x, it doesn't recognize Promise.all array correctly
    return componentConfig;
  }

  /**
   * Run all subscribers to the component config legacy load event
   *
   * @static
   * @param {ConfigLegacyLoadRegistry} subscribers
   * @param {BitId} id
   * @param {*} config
   * @memberof ComponentConfig
   */
  static async runOnLegacyLoadEvent(subscribers: ConfigLegacyLoadRegistry, id: BitId, config: any) {
    logger.debugAndAddBreadCrumb(
      'componentConfigLegacyLoad',
      `running on legacy load even for component ${id.toString()}`
    );
    try {
      await mapSeries(Object.keys(subscribers), async (extId: string) => {
        const func = subscribers[extId];
        return func(id, config);
      });
    } catch (err) {
      if (!ignoreLoadingExtensionsErrors) {
        throw err;
      }
      // TODO: improve texts
      logger.console(`\nfailed loading an extension for component ${id.toString()}, error is:`, 'warn', 'yellow');
      // TODO: this show an ugly error, we should somehow show a proper errors
      logger.console(err, 'warn', 'yellow');
      logger.console('the error has been ignored', 'warn', 'yellow');
      logger.warn('extension on load event throw an error', err);
    }
  }

  /**
   * Run all subscribers to the component config load event
   *
   * @static
   * @param {ConfigLoadRegistry} subscribers
   * @param {BitId} id
   * @memberof ComponentConfig
   */
  static async runOnLoadEvent(subscribers: ConfigLoadRegistry, id: BitId): Promise<any[]> {
    logger.debugAndAddBreadCrumb('componentConfigLoad', `running on load even for component ${id.toString()}`);
    try {
      const res = await mapSeries(Object.keys(subscribers), async (extId: string) => {
        const func = subscribers[extId];
        return func(id);
      });
      return res;
    } catch (err) {
      if (!ignoreLoadingExtensionsErrors) {
        throw err;
      }
      // TODO: improve texts
      logger.console(`\nfailed loading an extension for component ${id.toString()}, error is:`, 'warn', 'yellow');
      // TODO: this show an ugly error, we should somehow show a proper errors
      logger.console(err, 'warn', 'yellow');
      logger.console('the error has been ignored', 'warn', 'yellow');
      logger.warn('extension on load event throw an error', err);
    }
    return [];
  }
}
