/** @flow */
import CommandRegistrar from './command-registrar';
import { BIT_VERSION, BIT_USAGE, BIT_DESCRIPTION } from '../constants';
import Init from './commands/public-cmds/init-cmd';
import ScopeList from './commands/private-cmds/_list-cmd';
import ScopeSearch from './commands/private-cmds/_search-cmd';
import ScopeShow from './commands/private-cmds/_show-cmd';
import Create from './commands/public-cmds/create-cmd';
import Export from './commands/public-cmds/export-cmd';
import List from './commands/public-cmds/list-cmd';
import Modify from './commands/public-cmds/modify-cmd';
import Reset from './commands/public-cmds/reset-cmd';
import Commit from './commands/public-cmds/commit-cmd';
import Import from './commands/public-cmds/import-cmd';
import ClearCache from './commands/public-cmds/clear-cache-cmd';
import Config from './commands/public-cmds/config-cmd';
import Remote from './commands/public-cmds/remote-cmd';
import Search from './commands/public-cmds/search-cmd';
import Test from './commands/public-cmds/test-cmd';
import Show from './commands/public-cmds/show-cmd';
import Status from './commands/public-cmds/status-cmd';
import CatObject from './commands/private-cmds/cat-object-cmd';
import DescribeScope from './commands/private-cmds/_scope-cmd';
import Put from './commands/private-cmds/_put-cmd';
import Fetch from './commands/private-cmds/_fetch-cmd';
import Log from './commands/public-cmds/log-cmd';
import Build from './commands/public-cmds/build-cmd';
import CiUpdate from './commands/private-cmds/ci-update-cmd';
import RefreshScope from './commands/private-cmds/refresh-scope-cmd';
import CatScope from './commands/private-cmds/cat-scope-cmd';
import ScopeConfig from './commands/public-cmds/scope-config-cmd';
import Bind from './commands/public-cmds/bind-cmd';
import Watch from './commands/public-cmds/watch-cmd';

export default function registerCommands(): CommandRegistrar {
  return new CommandRegistrar(BIT_USAGE, BIT_DESCRIPTION, BIT_VERSION, [
    new Init(),
    new Create(),
    new Commit(),
    new Import(),
    new Export(),
    new Status(),
    new Modify(),
    new Reset(),
    new List(),
    new Config(),
    new ClearCache(),
    new Remote(),
    new CatObject(),
    new Show(),
    new Log(),
    new Search(),
    new Test(),
    new Put(),
    new ScopeList(),
    new ScopeSearch(),
    new ScopeShow(),
    new Fetch(),
    new Build(),
    new DescribeScope(),
    new CiUpdate(),
    new RefreshScope(),
    new CatScope(),
    new ScopeConfig(),
    new Bind(),
    new Watch(),
  ]);
}
