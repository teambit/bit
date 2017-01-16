/** @flow */
import CommandRegistrar from './command-registrar';
import { BIT_VERSION, BIT_USAGE, BIT_DESCRIPTION } from '../constants';
import Init from './commands/init-cmd';
import Create from './commands/create-cmd';
import Export from './commands/export-cmd';
import List from './commands/list-cmd';
import Modify from './commands/modify-cmd';
import Commit from './commands/commit-cmd';
// import Login from './commands/login-cmd';
// import Logout from './commands/logout-cmd';
import Import from './commands/import-cmd';
import Remote from './commands/remote-cmd';
// import Remove from './commands/remove-cmd';
import Search from './commands/search-cmd';
import Test from './commands/test-cmd';
import Show from './commands/show-cmd';
import Update from './commands/update-cmd';
import Status from './commands/status-cmd';
import CatObject from './commands/cat-object-cmd';
import Build from './commands/build-cmd';
// import Install from './commands/install-cmd';
// import Uninstall from './commands/uninstall-cmd';
import Prepare from './commands/_prepare-cmd';
import DescribeScope from './commands/_scope-cmd';
import Put from './commands/_put-cmd';
// import Scope from './commands/scope-cmd';
import Fetch from './commands/_fetch-cmd';
import Log from './commands/log-cmd';

export default function registerCommands(): CommandRegistrar {
  return new CommandRegistrar(BIT_USAGE, BIT_DESCRIPTION, BIT_VERSION, [
    new Init(),
    // new Scope(),
    new Create(),
    new Commit(),
    new Import(),
    new Update(),
    new Export(),
    new Status(),
    new Modify(),
    new List(),
    new Remote(),
    new CatObject(),
    new Show(),
    new Log(),
    // new Remove(),
    new Search(),
    new Test(),
    new Build(),
    // new Install(),
    // new Uninstall(),
    new Prepare(),
    new Put(),
    new Fetch(),
    new DescribeScope()
    // new Login(),
    // new Logout(),
  ]);
}
