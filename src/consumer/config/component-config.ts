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
  extensionsAddedConfig: { [prop: string]: any } | undefined;

  static componentConfigLoadingRegistry: { [extId: string]: Function } = {};
  static registerOnComponentConfigLoading(extId, func: (config) => any) {
    this.componentConfigLoadingRegistry[extId] = func;
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
  }

  /**
   * Use the workspaceConfig as a base. Override values if exist in componentConfig
   * This only used for legacy props that were defined in the root like compiler / tester
   */
  static mergeWithWorkspaceRootConfigs(
    componentId: BitId,
    componentConfig: Record<string, any>,
    workspaceConfig: WorkspaceConfig | undefined
  ): ComponentConfig {
    const plainWorkspaceConfig = workspaceConfig ? workspaceConfig._legacyPlainObject() : {};
    let workspaceConfigToMerge;
    if (plainWorkspaceConfig) {
      workspaceConfigToMerge = filterObject(plainWorkspaceConfig, (val, key) => key !== 'overrides');
    } else {
      workspaceConfigToMerge = workspaceConfig?.getComponentConfig(componentId);
    }
    // plainWorkspaceConfig = plainWorkspaceConfig || {};
    const mergedObject = R.merge(workspaceConfigToMerge, componentConfig);
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
    componentId,
    componentDir,
    workspaceDir,
    workspaceConfig,
    addConfigRegistry
  }: {
    componentId: BitId;
    componentDir: PathOsBasedRelative | undefined;
    workspaceDir: PathOsBasedRelative;
    workspaceConfig: WorkspaceConfig;
    addConfigRegistry: { [extId: string]: Function };
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
    const componentConfig = ComponentConfig.mergeWithWorkspaceRootConfigs(componentId, config, workspaceConfig);

    await this.runOnLoadEvent(this.componentConfigLoadingRegistry, componentConfig);
    componentConfig.path = bitJsonPath;
    const extensionsAddedConfig = await getConfigFromExtensions(
      componentId,
      componentConfig.extensions,
      addConfigRegistry
    );
    componentConfig.extensionsAddedConfig = extensionsAddedConfig;
    componentConfig.componentHasWrittenConfig = componentHasWrittenConfig;
    // @ts-ignore seems to be a bug in ts v3.7.x, it doesn't recognize Promise.all array correctly
    componentConfig.packageJsonFile = packageJsonFile;
    return componentConfig;
  }

  static async runOnLoadEvent(componentConfigLoadingRegistry, config) {
    const onLoadSubscribersP = Object.keys(componentConfigLoadingRegistry).map(extId => {
      const func = componentConfigLoadingRegistry[extId];
      return func(config);
    });
    return Promise.all(onLoadSubscribersP);
  }
}

async function getConfigFromExtensions(id: BitId, rawExtensionConfig: any, configsRegistry) {
  // const extensionsConfigModificationsP = configsRegistry.keys.map(entry => {
  //   // TODO: only running func for relevant extensions
  //   const func = configsRegistry.get(entry);
  //   return func()
  // });
  const extensionsConfigModificationsP = Object.keys(configsRegistry).map(extId => {
    // TODO: only running func for relevant extensions
    const func = configsRegistry[extId];
    return func();
  });
  const extensionsConfigModifications = await Promise.all(extensionsConfigModificationsP);
  const extensionsConfigModificationsObject = mergeExtensionsConfig(extensionsConfigModifications);
  return extensionsConfigModificationsObject;
}

function mergeExtensionsConfig(configs: any[]) {
  return configs.reduce((prev, curr) => {
    return R.mergeDeepLeft(prev, curr);
  }, {});
}
