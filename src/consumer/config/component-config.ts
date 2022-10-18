import mapSeries from 'p-map-series';
import R from 'ramda';
import { BitId } from '../../bit-id';
import { DEFAULT_REGISTRY_DOMAIN_PREFIX } from '../../constants';
import ShowDoctorError from '../../error/show-doctor-error';
import logger from '../../logger/logger';
import filterObject from '../../utils/filter-object';
import Component from '../component/consumer-component';
import PackageJsonFile from '../component/package-json-file';
import AbstractConfig from './abstract-config';
import { ComponentOverridesData } from './component-overrides';
import { ExtensionDataList } from './extension-data';

type ConfigProps = {
  lang?: string;
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

  constructor({ lang, bindingPrefix, extensions, defaultScope, overrides }: ConfigProps) {
    super({
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
    const componentObject = { ...superObject, overrides: this.overrides };
    const isPropDefaultOrEmpty = (val, key) => {
      if (key === 'overrides') return !R.isEmpty(val);
      return true;
    };
    return filterObject(componentObject, isPropDefaultOrEmpty);
  }

  validate(bitJsonPath: string) {
    if (this.extensions && typeof this.extensions !== 'object') {
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

  mergeWithComponentData(component: Component) {
    this.bindingPrefix = this.bindingPrefix || component.bindingPrefix;
    this.lang = this.lang || component.lang;
  }

  static async load({ componentId }: { componentId: BitId }): Promise<ComponentConfig> {
    const onLoadResults = await this.runOnLoadEvent(this.componentConfigLoadingRegistry, componentId);
    const wsComponentConfig = onLoadResults[0];
    const defaultScope = wsComponentConfig.defaultScope;
    const bindingPrefix = getBindingPrefixByDefaultScope(defaultScope);
    const componentConfig = new ComponentConfig({
      extensions: wsComponentConfig.extensions,
      defaultScope,
      bindingPrefix,
    });

    return componentConfig;
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
    } catch (err: any) {
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

export function getBindingPrefixByDefaultScope(defaultScope: string): string {
  const splittedScope = defaultScope.split('.');
  const defaultOwner = splittedScope.length === 1 ? defaultScope : splittedScope[0];
  let bindingPrefix = DEFAULT_REGISTRY_DOMAIN_PREFIX;
  if (defaultOwner && defaultOwner !== DEFAULT_REGISTRY_DOMAIN_PREFIX) {
    bindingPrefix = defaultOwner.startsWith('@') ? defaultOwner : `@${defaultOwner}`;
  }

  return bindingPrefix;
}
