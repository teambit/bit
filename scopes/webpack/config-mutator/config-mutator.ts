import { isObject, omit } from 'lodash';
import { Configuration, ResolveOptions, RuleSetRule } from 'webpack';
import { merge, mergeWithCustomize, mergeWithRules, CustomizeRule } from 'webpack-merge';
import { ICustomizeOptions } from 'webpack-merge/dist/types';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import { inject } from '@teambit/html.modules.inject-html-element';
import type { InjectedHtmlElement as CustomHtmlElement } from '@teambit/html.modules.inject-html-element';

export * from 'webpack-merge';

type ConflictPolicy = 'override' | 'error' | 'ignore';
type ArrayPosition = 'append' | 'prepend';

type AddKeyOpts = {
  conflictPolicy?: ConflictPolicy;
};

type AddToArrayOpts = {
  position?: ArrayPosition;
};

type MergeOpts = {
  rawConfigPosition: ArrayPosition;
};

type Rules = {
  [s: string]: CustomizeRule | Rules;
};

const defaultAddToArrayOpts: AddToArrayOpts = {
  position: 'prepend',
};

const defaultAddKeyOpts: AddKeyOpts = {
  conflictPolicy: 'override',
};

const defaultMergeOpts: MergeOpts = {
  rawConfigPosition: 'prepend',
};

export class WebpackConfigMutator {
  constructor(public raw: Configuration | any) {}

  clone(): WebpackConfigMutator {
    return new WebpackConfigMutator(merge({}, this.raw));
  }

  /**
   * Add a key value to the top level config
   * @param key
   * @param value
   */
  addTopLevel(key: string, value: any, opts: AddKeyOpts = {}): WebpackConfigMutator {
    const concreteOpts = Object.assign({}, defaultAddKeyOpts, opts);
    // eslint-disable-next-line no-prototype-builtins
    const exist = this.raw.hasOwnProperty(key);
    if (concreteOpts.conflictPolicy === 'override') {
      this.raw[key] = value;
    } else if (exist) {
      if (concreteOpts.conflictPolicy === 'error') {
        throw new Error(`key with name ${key} already exist in config`);
      }
    } else {
      this.raw[key] = value;
    }
    return this;
  }

  /**
   * Remove a key from the top level
   * @param key
   * @returns
   */
  removeTopLevel(key: string): WebpackConfigMutator {
    delete this.raw[key];
    return this;
  }

  /**
   * Add new entry to the config
   * @param entry
   * @param opts
   * @returns
   */
  addEntry(entry: string, opts: AddToArrayOpts = {}): WebpackConfigMutator {
    if (!this.raw.entry) {
      this.raw.entry = [];
    }
    if (!Array.isArray(this.raw.entry)) {
      throw new Error(`can't add an entry to a function type raw entry`);
    }
    this.raw.entry = addToArray(this.raw.entry, entry, opts);
    return this;
  }

  /**
   * Add rule to the module config
   * @param rule
   * @param opts
   * @returns
   */
  addModuleRule(rule: RuleSetRule | any, opts: AddToArrayOpts = {}): WebpackConfigMutator {
    if (!this.raw.module) {
      this.raw.module = {};
    }
    if (!this.raw.module.rules) {
      this.raw.module.rules = [];
    }

    addToArray(this.raw.module.rules, rule, opts);
    return this;
  }

  /**
   * Add many rules to the module config
   * @param rules
   * @param opts
   * @returns
   */
  addModuleRules(rules: RuleSetRule[] | any[], opts: AddToArrayOpts = {}): WebpackConfigMutator {
    rules.forEach((rule) => this.addModuleRule(rule, opts));
    return this;
  }

  /** Add rule to the module config
   * @param entry
   * @param opts
   * @returns
   */
  addRuleToOneOf(rule: RuleSetRule | any, opts: AddToArrayOpts = {}): WebpackConfigMutator {
    if (!this.raw.module) {
      this.raw.module = {};
    }
    if (!this.raw.module.rules) {
      this.raw.module.rules = [];
    }
    // @ts-ignore
    const moduleWithOneOf = this.raw.module.rules.find((r) => !!(r as RuleSetRule).oneOf);
    if (!moduleWithOneOf) {
      this.raw.module.rules.unshift({ oneOf: [] });
    }

    addToArray(moduleWithOneOf.oneOf, rule, opts);
    return this;
  }

  /**
   * Add a new plugin
   * @param plugin
   * @param opts
   * @returns
   */
  addPlugin(plugin: any, opts: AddToArrayOpts = {}): WebpackConfigMutator {
    if (!this.raw.plugins) {
      this.raw.plugins = [];
    }
    addToArray(this.raw.plugins, plugin, opts);
    return this;
  }

  /**
   * Add many new plugins
   * @param plugin
   * @param opts
   * @returns
   */
  addPlugins(plugins: Array<any>, opts: AddToArrayOpts = {}): WebpackConfigMutator {
    if (!this.raw.plugins) {
      this.raw.plugins = [];
    }
    this.raw.plugins = addManyToArray(this.raw.plugins, plugins, opts);
    return this;
  }

  /**
   * Add aliases
   * @param aliases
   * @returns
   */
  addAliases(aliases: { [index: string]: string | false | string[] }): WebpackConfigMutator {
    if (!this.raw.resolve) {
      this.raw.resolve = {};
    }
    if (!this.raw.resolve.alias) {
      this.raw.resolve.alias = {};
    }
    Object.assign(this.raw.resolve.alias, aliases);
    return this;
  }

  /**
   * Add aliases
   * @param aliases
   * @returns
   */
  removeAliases(aliases: string[]): WebpackConfigMutator {
    if (!this.raw.resolve) {
      return this;
    }
    if (!this.raw.resolve.alias) {
      return this;
    }
    if (isObject(this.raw?.resolve?.alias)) {
      // @ts-ignore
      this.raw.resolve.alias = omit(this.raw.resolve.alias, aliases);
    }
    return this;
  }

  /**
   * Add resolve
   * @param resolve
   * @returns
   */
  addResolve(resolve: ResolveOptions | any): WebpackConfigMutator {
    if (!this.raw.resolve) {
      this.raw.resolve = {};
    }
    Object.assign(this.raw.resolve, resolve);
    return this;
  }

  /**
   * to be used to ignore replace packages with global variable
   * Useful when trying to offload libs to CDN
   * @param externalDeps
   * @returns
   */
  addExternals(externalDeps: Configuration['externals'] | any): WebpackConfigMutator {
    if (!externalDeps) return this;
    let externals = this.raw.externals;
    if (!externals) {
      externals = externalDeps;
    } else if (Array.isArray(externalDeps)) {
      externals = externalDeps.concat(externals);
    } else if (
      Array.isArray(externals) ||
      externalDeps.constructor === Function ||
      externalDeps.constructor === RegExp
    ) {
      externals = [externalDeps].concat(externals);
    } else if (externalDeps instanceof Object && externals instanceof Object) {
      // @ts-ignore
      externals = {
        ...externals,
        ...externalDeps,
      };
    }

    this.raw.externals = externals;
    return this;
  }

  /**
   * Merge external configs with the current config (utilize webpack-merge)
   * @param configs
   * @param opts
   */
  merge(config: Configuration | Configuration[] | any, opts?: MergeOpts): WebpackConfigMutator {
    const configs = Array.isArray(config) ? config : [config];
    const concreteOpts = Object.assign({}, defaultMergeOpts, opts || {});
    const { firstConfig, configs: otherConfigs } = getConfigsToMerge(this.raw, configs, concreteOpts.rawConfigPosition);
    const merged = merge(firstConfig, ...otherConfigs);
    this.raw = merged;
    return this;
  }

  /**
   * Merge external configs with the current config uses customize (array/object) function (utilize webpack-merge)
   * @param configs
   * @param customizes
   * @param opts
   * @returns
   */
  mergeWithCustomize(
    configs: Configuration[] | any,
    customizes: ICustomizeOptions,
    opts: MergeOpts
  ): WebpackConfigMutator {
    const concreteOpts = Object.assign({}, defaultMergeOpts, opts);
    const { firstConfig, configs: otherConfigs } = getConfigsToMerge(this.raw, configs, concreteOpts.rawConfigPosition);
    const merged = mergeWithCustomize(customizes)(firstConfig, ...otherConfigs);
    this.raw = merged;
    return this;
  }

  /**
   * Merge external configs with the current config uses rules (utilize webpack-merge)
   * @param configs
   * @param rules
   * @param opts
   * @returns
   */
  mergeWithRules(configs: Configuration[] | any, rules: Rules | any, opts: MergeOpts): WebpackConfigMutator | any {
    const concreteOpts = Object.assign({}, defaultMergeOpts, opts);
    const { firstConfig, configs: otherConfigs } = getConfigsToMerge(this.raw, configs, concreteOpts.rawConfigPosition);
    const merged = mergeWithRules(rules)(firstConfig, ...otherConfigs);
    this.raw = merged;
    return this;
  }

  /**
   * Add PostCSS plugins
   * @param plugins
   * @returns
   * @example
   * addPostCssPlugins([require('tailwindcss')]);
   */
  addPostCssPlugins(plugins: Array<any>): WebpackConfigMutator {
    this.raw.module?.rules?.forEach((rule: any) => {
      if (rule.use) processUseArray(rule.use, plugins);
      if (rule.oneOf) rule.oneOf.forEach((oneOfRule) => processUseArray(oneOfRule.use, plugins));
    });

    return this;
  }

  /**
   * Add a custom element to the html template
   * @param element
   * @returns
   * @example
   * addElementToHtmlTemplate({ parent: 'head', position: 'append', tag: 'script', attributes: { src: 'https://cdn.com/script.js', async: true } });
   * addElementToHtmlTemplate({ parent: 'body', position: 'prepend', tag: 'script', content: 'console.log("hello world")' });
   */
  addElementToHtmlTemplate(element: CustomHtmlElement) {
    if (!this.raw.plugins) {
      this.raw.plugins = [];
    }

    const htmlPlugins = this.raw?.plugins?.filter(
      (plugin) => plugin.constructor.name === 'HtmlWebpackPlugin'
    ) as HtmlWebpackPlugin[];

    if (htmlPlugins) {
      // iterate over all html plugins and add the scripts to the html
      htmlPlugins.forEach((htmlPlugin) => {
        const templateContent = htmlPlugin.options?.templateContent || htmlPlugin.userOptions.templateContent;

        const htmlContent =
          typeof templateContent === 'function' ? (templateContent({}) as string) : (templateContent as string);

        const newHtmlContent = inject(htmlContent, element);

        if (htmlPlugin.options) htmlPlugin.options.templateContent = newHtmlContent;
        if (htmlPlugin.userOptions) htmlPlugin.userOptions.templateContent = newHtmlContent;
      });
    }

    return this;
  }

  /**
   * Remove a custom element from the html template
   * @param element
   * @returns
   * @example
   * removeElementFromHtmlTemplate('<script>console.log("hello")</script>');
   * removeElementFromHtmlTemplate('<script src="https://example.com/script.js"></script>');
   */
  removeElementFromHtmlTemplate(element: string) {
    if (!this.raw.plugins) {
      this.raw.plugins = [];
    }

    const htmlPlugin = this.raw?.plugins?.find(
      (plugin) => plugin.constructor.name === 'HtmlWebpackPlugin'
    ) as HtmlWebpackPlugin;

    if (htmlPlugin) {
      const htmlContent =
        typeof htmlPlugin.options?.templateContent === 'function'
          ? htmlPlugin.options?.templateContent({})
          : htmlPlugin.options?.templateContent;

      if (htmlPlugin.options) htmlPlugin.options.templateContent = (htmlContent as string).replace(element, '');

      this.raw.plugins = this.raw.plugins.map((plugin) => {
        if (plugin.constructor.name === 'HtmlWebpackPlugin') {
          return htmlPlugin;
        }
        return plugin;
      });
    }
    return this;
  }
}

function processUseArray(useArray: any[], plugins: any[]) {
  if (!useArray) return;

  useArray.forEach((use: any) => {
    if (!use.loader || !use.loader.includes('postcss-loader')) return;
    if (!use.options.postcssOptions) return;

    use.options.postcssOptions.plugins = use.options.postcssOptions.plugins || [];
    use.options.postcssOptions.plugins.unshift(...plugins);
  });
}

function getConfigsToMerge(
  originalConfig: Configuration | any,
  configs: Configuration[] | any,
  originalPosition: ArrayPosition
): { firstConfig: Configuration | any; configs: Configuration[] | any } {
  let firstConfig = originalConfig;
  if (originalPosition === 'append') {
    firstConfig = configs.shift() || {};
    configs.push(originalConfig);
  }
  return {
    firstConfig,
    configs,
  };
}

function addToArray(array: Array<any>, val: any, opts: AddToArrayOpts = {}): Array<any> {
  const concreteOpts = Object.assign({}, defaultAddToArrayOpts, opts);
  if (concreteOpts.position === 'prepend') {
    array?.unshift(val);
  } else {
    array?.push(val);
  }
  return array;
}

function addManyToArray(array: Array<any>, vals: Array<any>, opts: AddToArrayOpts = {}): Array<any> {
  const concreteOpts = Object.assign({}, defaultAddToArrayOpts, opts);
  if (concreteOpts.position === 'prepend') {
    // array = array?.concat(vals);
    array?.unshift(...vals);
  } else {
    // array = vals?.concat(array);
    array?.push(...vals);
  }
  return array;
}
