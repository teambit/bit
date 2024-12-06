/* eslint max-classes-per-file: 0 */
import chalk from 'chalk';
import rightpad from 'pad-right';
import * as config from '@teambit/legacy.global-config';
import { BASE_DOCS_DOMAIN } from '@teambit/legacy.constants';
import { Command, CommandOptions } from '@teambit/cli';

class ConfigSet implements Command {
  name = 'set <key> <val>';
  description = 'set a global configuration';
  extendedDescription = `to set temporary configuration by env variable, prefix with "BIT_CONFIG", replace "." with "_" and change to upper case.
for example, "user.token" becomes "BIT_CONFIG_USER_TOKEN"`;
  baseUrl = 'reference/config/bit-config/';
  alias = '';
  skipWorkspace = true;
  options = [] as CommandOptions;
  loadAspects = false;

  async report([key, value]: [string, string]) {
    await config.set(key, value);
    return chalk.green('added configuration successfully');
  }
}

class ConfigGet implements Command {
  name = 'get <key>';
  description = 'get a value from global configuration';
  alias = '';
  options = [] as CommandOptions;
  loadAspects = false;

  async report([key]: [string]) {
    const value = await config.get(key);
    return value || '';
  }
}

class ConfigList implements Command {
  name = 'list';
  description = 'list all configuration(s)';
  alias = '';
  options = [] as CommandOptions;
  loadAspects = false;

  async report() {
    const conf: { [key: string]: string } = await config.list();
    return Object.entries(conf)
      .map((tuple) => {
        return tuple.join('     ');
      })
      .join('\n');
  }
}

class ConfigDel implements Command {
  name = 'del <key>';
  description = 'delete given key from global configuration';
  alias = '';
  options = [] as CommandOptions;
  loadAspects = false;

  async report([key]: [string]) {
    await config.del(key);
    return chalk.green('deleted successfully');
  }
}

export class ConfigCmd implements Command {
  name = 'config';
  description = 'global config management';
  extendedDescription = `${BASE_DOCS_DOMAIN}reference/config/bit-config`;
  group = 'general';
  alias = '';
  loadAspects = false;
  commands = [new ConfigSet(), new ConfigDel(), new ConfigGet(), new ConfigList()];
  options = [] as CommandOptions;

  async report() {
    const conf: { [key: string]: string } = await config.list();
    return Object.entries(conf)
      .map((tuple) => {
        tuple[0] = rightpad(tuple[0], 45, ' ');
        return tuple.join('');
      })
      .join('\n');
  }
}
