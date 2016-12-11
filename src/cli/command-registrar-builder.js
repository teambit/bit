/** @flow */
import CommandRegistrar from './command-registrar';
import { BIT_VERSION, BIT_USAGE, BIT_DESCRIPTION } from '../constants';
import Init from './commands/init-cmd';
import Create from './commands/create-cmd';
import List from './commands/list-cmd';
import Modify from './commands/modify-cmd';
import Export from './commands/export-cmd';
import Login from './commands/login-cmd';
import Logout from './commands/logout-cmd';
import Import from './commands/import-cmd';
import Remote from './commands/remote-cmd';
import Remove from './commands/remove-cmd';
import Search from './commands/search-cmd';
import Box from './commands/box-cmd';
import Test from './commands/test-cmd';
import Show from './commands/show-cmd';
import Update from './commands/update-cmd';
import Status from './commands/status-cmd';
import Build from './commands/build-cmd';
import ValidatePush from './commands/validate-push-cmd';

export default function registerCommands(): CommandRegistrar {
  return new CommandRegistrar(BIT_USAGE, BIT_DESCRIPTION, BIT_VERSION, [
    new Init(),
    new Box(),
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
    new Test(),
    new Update(),
    new Build(),
    new ValidatePush()
  ]);
}
