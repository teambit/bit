import mapSeries from 'p-map-series';
import { pickBy } from 'lodash';
import R from 'ramda';
import { ComponentID } from '@teambit/component-id';
import logger from '../../logger/logger';
import Component from '../component/consumer-component';
import PackageJsonFile from '../component/package-json-file';
import AbstractConfig from './abstract-config';
import { ExtensionDataList } from './extension-data';

type ConfigProps = {
  lang?: string;
  bindingPrefix: string;
  extensions?: ExtensionDataList;
  defaultScope?: string;
};

type ConfigLoadRegistry = { [extId: string]: Function };

// TODO: take for some other place like config
// TODO: unify this and the same in src/components/utils/load-extensions/load-resolved-extensions.ts
const ignoreLoadingExtensionsErrors = false;

export default class ComponentConfig extends AbstractConfig {
  defaultScope: string | undefined;
  componentHasWrittenConfig = false; // whether a component has component.json written to FS or package.json written with 'bit' property
  packageJsonFile: PackageJsonFile | null | undefined;

  static componentConfigLoadingRegistry: ConfigLoadRegistry = {};
  static registerOnComponentConfigLoading(extId, func: (id) => any) {
    this.componentConfigLoadingRegistry[extId] = func;
  }

  constructor({ bindingPrefix, extensions, defaultScope }: ConfigProps) {
    super({
      bindingPrefix,
      extensions,
    });
    this.defaultScope = defaultScope;
  }

  toPlainObject() {
    const superObject = super.toPlainObject();
    const componentObject = superObject;
    const isPropDefaultOrEmpty = (val, key) => {
      if (key === 'overrides') return !R.isEmpty(val);
      return true;
    };
    return pickBy(componentObject, isPropDefaultOrEmpty);
  }

  mergeWithComponentData(component: Component) {
    this.bindingPrefix = this.bindingPrefix || component.bindingPrefix;
    this.lang = this.lang || component.lang;
  }

  static async load({ componentId }: { componentId: ComponentID }): Promise<ComponentConfig> {
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
  static async runOnLoadEvent(subscribers: ConfigLoadRegistry, id: ComponentID): Promise<any[]> {
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
  return `@${defaultOwner}`;
}
