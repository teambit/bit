/** @flow */
import CommandRegistrar from './command-registrar';
import { BIT_VERSION, BIT_USAGE, BIT_DESCRIPTION } from '../constants';
import Init from './commands/init';
import Add from './commands/add';
import List from './commands/list';
import Inline from './commands/inline';
import Login from './commands/login';
import Logout from './commands/logout';
import Pull from './commands/pull';
import Push from './commands/push';
import Remote from './commands/remote';
import Remove from './commands/remove';
import Search from './commands/search';
import Test from './commands/test';
import Update from './commands/update';
import Status from './commands/status';
import Edit from './commands/edit';
import Open from './commands/open';

export default function registerCommands(): CommandRegistrar {
  return new CommandRegistrar(BIT_USAGE, BIT_DESCRIPTION, BIT_VERSION, [
    new Init(),
    new Add(),
    new List(),
    new Inline(),
    new Login(),
    new Logout(),
    new Push(),
    new Status(),
    new Pull(),
    new Remote(),
    new Remove(),
    new Search(),
    new Open(),
    new Edit(),
    new Test(),
    new Update()
  ]);
}
