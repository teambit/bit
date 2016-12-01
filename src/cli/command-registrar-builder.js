/** @flow */
import CommandRegistrar from './command-registrar';
import { BIT_VERSION, BIT_USAGE, BIT_DESCRIPTION } from '../constants';
import Init from './commands/init';
import Create from './commands/create';
import List from './commands/list';
import Modify from './commands/modify';
import Export from './commands/export';
import Login from './commands/login';
import Logout from './commands/logout';
import Import from './commands/import';
import Remote from './commands/remote';
import Remove from './commands/remove';
import Search from './commands/search';
import Test from './commands/test';
import Show from './commands/show';
import Update from './commands/update';
import Status from './commands/status';
import Edit from './commands/edit';
import Open from './commands/open';

export default function registerCommands(): CommandRegistrar {
  return new CommandRegistrar(BIT_USAGE, BIT_DESCRIPTION, BIT_VERSION, [
    new Init(),
    new Create(),
    new List(),
    new Modify(),
    new Export(),
    new Login(),
    new Logout(),
    new Import(),
    new Show(),
    new Status(),
    new Remote(),
    new Remove(),
    new Search(),
    new Open(),
    new Edit(),
    new Test(),
    new Update()
  ]);
}
