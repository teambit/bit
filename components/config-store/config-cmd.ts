/* eslint max-classes-per-file: 0 */
import chalk from 'chalk';
import rightpad from 'pad-right';
import { BASE_DOCS_DOMAIN } from '@teambit/legacy.constants';
import { Command, CommandOptions } from '@teambit/cli';
import { ConfigStoreMain, StoreOrigin } from './config-store.main.runtime';

class ConfigSet implements Command {
  name = 'set <key> <val>';
  description = 'set a configuration. default to save it globally';
  extendedDescription = `to set temporary configuration by env variable, prefix with "BIT_CONFIG", replace "." with "_" and change to upper case.
for example, "user.token" becomes "BIT_CONFIG_USER_TOKEN"`;
  baseUrl = 'reference/config/bit-config/';
  alias = '';
  skipWorkspace = true;
  options = [
    ['l', 'local', 'set the configuration in the current scope (saved in .bit/scope.json)'],
    ['t', 'local-track', 'set the configuration in the current workspace (saved in workspace.jsonc)'],
  ] as CommandOptions;

  constructor(private configStore: ConfigStoreMain) {}

  async report([key, value]: [string, string], { local, localTrack }: { local?: boolean, localTrack?: boolean }) {
    const getOrigin = () => {
      if (local) return 'scope';
      if (localTrack) return 'workspace';
      return 'global';
    }
    await this.configStore.setConfig(key, value, getOrigin());
    return chalk.green('added configuration successfully');
  }
}

class ConfigGet implements Command {
  name = 'get <key>';
  description = 'get a value from global configuration';
  alias = '';
  options = [] as CommandOptions;

  constructor(private configStore: ConfigStoreMain) {}

  async report([key]: [string]) {
    const value = this.configStore.getConfig(key);
    return value || '';
  }
}

class ConfigList implements Command {
  name = 'list';
  description = 'list all configuration(s)';
  alias = '';
  options = [] as CommandOptions;

  constructor(private configStore: ConfigStoreMain) {}

  async report() {
    const conf: { [key: string]: string } = this.configStore.listConfig();
    return Object.entries(conf)
      .map((tuple) => {
        tuple[0] = rightpad(tuple[0], 45, ' ');
        return tuple.join('');
      })
      .join('\n');
  }
}

class ConfigDel implements Command {
  name = 'del <key>';
  description = 'delete given key from global configuration';
  alias = '';
  options = [
    ['o', 'origin <origin>', 'default to delete whenever it found. specify to delete specifically from the following: [scope, workspace, global]'],
  ] as CommandOptions;

  constructor(private configStore: ConfigStoreMain) {}

  async report([key]: [string], { origin }: { origin?: StoreOrigin }) {
    await this.configStore.delConfig(key, origin);
    return chalk.green('deleted successfully');
  }
}

export class ConfigCmd implements Command {
  name = 'config';
  description = 'config management';
  extendedDescription = `${BASE_DOCS_DOMAIN}reference/config/bit-config`;
  group = 'general';
  alias = '';
  loadAspects = false;
  commands: Command[] = [];
  options = [] as CommandOptions;

  constructor(private configStore: ConfigStoreMain){
    this.commands = [
      new ConfigSet(configStore), new ConfigDel(configStore), new ConfigGet(configStore), new ConfigList(configStore)
    ];
  }

  async report() {
    return new ConfigList(this.configStore).report();
  }
}
