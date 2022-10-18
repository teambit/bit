import { cloneDeep, set, get, has } from 'lodash';
import { Linter } from 'eslint';
import { ESLintOptions } from '@teambit/eslint';

export class EslintConfigMutator {
  constructor(public raw: ESLintOptions) {}

  clone(): EslintConfigMutator {
    return new EslintConfigMutator(cloneDeep(this.raw));
  }

  addExtensionTypes(extensionsToAdd: string[]): EslintConfigMutator {
    if (!extensionsToAdd.length) return this;
    this.raw.extensions = this.raw.extensions || [];
    extensionsToAdd.forEach((extension) => {
      let extensionWithDotPrefix = extension;
      if (!extension.startsWith('.')) {
        extensionWithDotPrefix = `.${extension}`;
      }
      if (!this.raw.extensions?.includes(extensionWithDotPrefix)) {
        this.raw.extensions?.push(extensionWithDotPrefix);
      }
    });
    return this;
  }

  setTsConfig(tsconfig: Record<string, any>): EslintConfigMutator {
    this.raw.tsConfig = tsconfig;
    return this;
  }

  setPluginPath(newPath: string): EslintConfigMutator {
    this.raw.pluginPath = newPath;
    return this;
  }

  setFormatter(formatter: string): EslintConfigMutator {
    this.raw.formatter = formatter;
    return this;
  }

  setRule(ruleName: string, ruleEntry: Linter.RuleEntry): EslintConfigMutator {
    set(this.raw, ['config', 'overrideConfig', 'rules', ruleName], ruleEntry);
    return this;
  }

  setEnv(envName: string, envEntry: boolean): EslintConfigMutator {
    set(this.raw, ['config', 'envs', envName], envEntry);
    return this;
  }

  addExtends(extendsToAdd: string[]): EslintConfigMutator {
    addToArrayInPath(this.raw, ['config', 'overrideConfig', 'extends'], extendsToAdd);
    return this;
  }

  addPlugins(extendsToAdd: string[]): EslintConfigMutator {
    addToArrayInPath(this.raw, ['config', 'extends'], extendsToAdd);
    return this;
  }

  addOverrides(overrides: Linter.ConfigOverride[]): EslintConfigMutator {
    addToArrayInPath(this.raw, ['config', 'overrides'], overrides);
    return this;
  }
}

function addToArrayInPath(obj: ESLintOptions, path: string[], items: Array<any>): ESLintOptions {
  let newItems = items;
  if (has(obj, path)) {
    const currentItems = get(obj, path);
    if (typeof currentItems === 'string') {
      newItems.push(currentItems);
    } else {
      newItems = newItems.concat(currentItems || []);
    }
  }
  set(obj, path, newItems);
  return obj;
}
