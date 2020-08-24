/* eslint max-classes-per-file: 0 */
import chalk from 'chalk';

import { scopeConfig } from '../../../api/scope';
import { objectToStringifiedTupleArray } from '../../../utils';
import { LegacyCommand } from '../../legacy-command';

class ScopeConfigSet implements LegacyCommand {
  name = 'set <key> <val>';
  description = 'set a scope configuration';
  alias = '';
  private = true;
  opts = [];

  action([key, value]: [string, string]): Promise<any> {
    return scopeConfig.set(key, value);
  }

  report({ key, value }: { key: string; value: number }): string {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return `${chalk.yellow(key)} has been set to - ${chalk.yellow(value)}`;
  }
}

class ScopeConfigGet implements LegacyCommand {
  name = 'get <key>';
  description = 'get a scope configuration';
  alias = '';
  private = true;
  opts = [];

  action([key]: [string]): Promise<any> {
    return scopeConfig.get(key);
  }

  report(value: string): string {
    return value;
  }
}

class ScopeConfigList implements LegacyCommand {
  name = 'list';
  description = 'list all scope configuration(s)';
  alias = '';
  opts = [];

  action(): Promise<any> {
    return scopeConfig.list();
  }

  report(conf: { [key: string]: any }): string {
    return objectToStringifiedTupleArray(conf)
      .map((tuple) => {
        return tuple.join('     ');
      })
      .join('\n');
  }
}

class ScopeConfigDel implements LegacyCommand {
  name = 'del <key>';
  description = 'delete given key from global configuration';
  alias = '';
  opts = [];

  action([key]: [string]): Promise<any> {
    return scopeConfig.del(key);
  }

  report(): string {
    return 'deleted successfully';
  }
}

export default class ScopeConfig implements LegacyCommand {
  name = 'scope-config';
  description = 'scope config management';
  alias = '';
  commands = [new ScopeConfigSet(), new ScopeConfigDel(), new ScopeConfigGet(), new ScopeConfigList()];
  opts = [];

  action(): Promise<any> {
    return scopeConfig.list();
  }

  report(conf: { [key: string]: string }): string {
    return objectToStringifiedTupleArray(conf)
      .map((tuple) => {
        return tuple.join('     ');
      })
      .join('\n');
  }
}
