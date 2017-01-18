/** @flow */
import CommandRegistrar from './command-registrar';
import { BIT_VERSION, BIT_USAGE, BIT_DESCRIPTION } from '../constants';
import Init from './commands/other-cmds/init-cmd';
import ScopeList from './commands/scope-cmds/_list-cmd';
import Create from './commands/consumer-cmds/create-cmd';
import Export from './commands/consumer-cmds/export-cmd';
import List from './commands/consumer-cmds/list-cmd';
import Modify from './commands/consumer-cmds/modify-cmd';
import Commit from './commands/consumer-cmds/commit-cmd';
import Import from './commands/consumer-cmds/import-cmd';
import Config from './commands/consumer-cmds/config-cmd';
import Remote from './commands/consumer-cmds/remote-cmd';
import Search from './commands/consumer-cmds/search-cmd';
import Test from './commands/consumer-cmds/test-cmd';
import Show from './commands/consumer-cmds/show-cmd';
import Status from './commands/consumer-cmds/status-cmd';
import CatObject from './commands/scope-cmds/cat-object-cmd';
import Resolver from './commands/scope-cmds/resolver-cmd';
import Prepare from './commands/scope-cmds/_prepare-cmd';
import DescribeScope from './commands/scope-cmds/_scope-cmd';
import Put from './commands/scope-cmds/_put-cmd';
import Fetch from './commands/scope-cmds/_fetch-cmd';
import Log from './commands/consumer-cmds/log-cmd';

export default function registerCommands(): CommandRegistrar {
  return new CommandRegistrar(BIT_USAGE, BIT_DESCRIPTION, BIT_VERSION, [
    new Init(),
    new Create(),
    new Commit(),
    new Import(),
    new Export(),
    new Status(),
    new Modify(),
    new List(),
    new Config(),
    new Remote(),
    new CatObject(),
    new Show(),
    new Log(),
    new Resolver(),
    new Search(),
    new Test(),
    new Prepare(),
    new Put(),
    new ScopeList(),
    new Fetch(),
    new DescribeScope()
  ]);
}
