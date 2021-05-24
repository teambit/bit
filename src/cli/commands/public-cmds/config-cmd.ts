/* eslint max-classes-per-file: 0 */
import chalk from 'chalk';
import rightpad from 'pad-right';

// import { config } from '../../../api/consumer';
// const config = require('../../../api/consumer/lib/global-config');
import * as config from '../../../api/consumer/lib/global-config';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import { Group } from '../../command-groups';
import { LegacyCommand } from '../../legacy-command';

class ConfigSet implements LegacyCommand {
  name = 'set <key> <val>';
  description = 'set a global configuration';
  alias = '';
  skipWorkspace = true;
  opts = [];

  action([key, value]: [string, string]): Promise<any> {
    return config.set(key, value);
  }

  report(): string {
    return chalk.green('added configuration successfully');
  }
}

class ConfigGet implements LegacyCommand {
  name = 'get <key>';
  description = 'get a global configuration';
  alias = '';
  opts = [];

  action([key]: [string]): Promise<any> {
    return config.get(key);
  }

  report(value: string): string {
    return value;
  }
}

class ConfigList implements LegacyCommand {
  name = 'list';
  description = 'list all configuration(s)';
  alias = '';
  opts = [];

  action(): Promise<any> {
    return config.list();
  }

  report(conf: { [key: string]: string }): string {
    return Object.entries(conf)
      .map((tuple) => {
        return tuple.join('     ');
      })
      .join('\n');
  }
}

class ConfigDel implements LegacyCommand {
  name = 'del <key>';
  description = 'delete given key from global configuration';
  alias = '';
  opts = [];

  action([key]: [string]): Promise<any> {
    return config.del(key);
  }

  report(): string {
    return chalk.green('deleted successfully');
  }
}

export default class Config implements LegacyCommand {
  name = 'config';
  description = `global config management.\n  https://${BASE_DOCS_DOMAIN}/docs/conf-config`;
  shortDescription = 'global config management';
  group: Group = 'general';
  alias = '';
  commands = [new ConfigSet(), new ConfigDel(), new ConfigGet(), new ConfigList()];
  opts = [];
  migration = false;

  action(): Promise<any> {
    return config.list();
  }

  report(conf: { [key: string]: string }): string {
    return Object.entries(conf)
      .map((tuple) => {
        tuple[0] = rightpad(tuple[0], 30, ' ');
        return tuple.join('');
      })
      .join('\n');
  }
}
