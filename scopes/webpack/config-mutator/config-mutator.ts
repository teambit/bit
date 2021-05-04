import { Configuration, ResolveOptions, RuleSetRule } from 'webpack';
import { merge, mergeWithCustomize, mergeWithRules, CustomizeRule } from 'webpack-merge';
import { ICustomizeOptions } from 'webpack-merge/dist/types';

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
  constructor(public raw: Configuration) {}

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
   * @param entry
   * @param opts
   * @returns
   */
  addModuleRule(rule: RuleSetRule, opts: AddToArrayOpts = {}): WebpackConfigMutator {
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
   * Add resolve
   * @param resolve
   * @returns
   */
  addResolve(resolve: ResolveOptions): WebpackConfigMutator {
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
  addExternals(externalDeps: Configuration['externals']): WebpackConfigMutator {
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
  merge(configs: Configuration[], opts?: MergeOpts): WebpackConfigMutator {
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
  mergeWithCustomize(configs: Configuration[], customizes: ICustomizeOptions, opts: MergeOpts): WebpackConfigMutator {
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
  mergeWithRules(configs: Configuration[], rules: Rules, opts: MergeOpts): WebpackConfigMutator {
    const concreteOpts = Object.assign({}, defaultMergeOpts, opts);
    const { firstConfig, configs: otherConfigs } = getConfigsToMerge(this.raw, configs, concreteOpts.rawConfigPosition);
    const merged = mergeWithRules(rules)(firstConfig, ...otherConfigs);
    this.raw = merged;
    return this;
  }
}

function getConfigsToMerge(
  originalConfig: Configuration,
  configs: Configuration[],
  originalPosition: ArrayPosition
): { firstConfig: Configuration; configs: Configuration[] } {
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
