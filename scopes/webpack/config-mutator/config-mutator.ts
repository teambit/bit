import { Configuration } from 'webpack';
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
    addToArray(this.raw.entry, entry, opts);
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
   * Merge external configs with the current config (utilize webpack-merge)
   * @param configs
   * @param opts
   */
  merge(configs: Configuration[], opts: MergeOpts): WebpackConfigMutator {
    const concreteOpts = Object.assign({}, defaultMergeOpts, opts);
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
  if (concreteOpts.position === 'append') {
    array?.unshift(val);
  } else {
    array?.push(val);
  }
  return array;
}
