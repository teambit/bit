/** @flow */
import Command from '../../command';
import chalk from 'chalk';
import { objectToStringifiedTupleArray } from '../../../utils';
import { scopeConfig } from '../../../api/scope';

export default class ScopeConfig extends Command {
  name = 'scope-config';
  description = 'scope config management';
  alias = '';
  commands = [new ScopeConfigSet(), new ScopeConfigDel(), new ScopeConfigGet(), new ScopeConfigList()];
  opts = [];
  migration = true;

  action(): Promise<any> {
    return scopeConfig.list();
  }

  report(conf: { [string]: string }): string {
    return objectToStringifiedTupleArray(conf)
      .map((tuple) => {
        return tuple.join('     ');
      })
      .join('\n');
  }
}

class ScopeConfigSet extends Command {
  name = 'set <key> <val>';
  description = 'set a scope configuration';
  alias = '';
  private = true;
  opts = [];

  action([key, value]: [string, string]): Promise<any> {
    return scopeConfig.set(key, value);
  }

  report({ key, value }: { key: string, value: number }): string {
    return `${chalk.yellow(key)} has been set to - ${chalk.yellow(value)}`;
  }
}

class ScopeConfigGet extends Command {
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

class ScopeConfigList extends Command {
  name = 'list';
  description = 'list all scope configuration(s)';
  alias = '';
  opts = [];

  action(): Promise<any> {
    return scopeConfig.list();
  }

  report(conf: { [string]: any }): string {
    return objectToStringifiedTupleArray(conf)
      .map((tuple) => {
        return tuple.join('     ');
      })
      .join('\n');
  }
}

class ScopeConfigDel extends Command {
  name = 'del <key>';
  description = 'delete given key from global configuration';
  alias = '';
  opts = [];

  action([key]: [string]): Promise<any> {
    return scopeConfig.del(key);
  }

  report(conf: { [string]: string }): string {
    return 'deleted successfully';
  }
}
