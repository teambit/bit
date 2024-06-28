import { BIT_DESCRIPTION, BIT_USAGE, BIT_VERSION } from '../constants';
import CommandRegistry from './command-registry';
import CatComponent from './commands/private-cmds/cat-component-cmd';
import { CatVersionHistoryCmd } from './commands/private-cmds/cat-version-history-cmd';
import CatLane from './commands/private-cmds/cat-lane-cmd';
import CatObject from './commands/private-cmds/cat-object-cmd';
import CatScope from './commands/private-cmds/cat-scope-cmd';
import Config from './commands/public-cmds/config-cmd';
import Remote from './commands/public-cmds/remote-cmd';
import ScopeConfig from './commands/public-cmds/scope-config-cmd';
import RunAction from './commands/private-cmds/run-action.cmd';

export default function registerCommands(): CommandRegistry {
  return new CommandRegistry(BIT_USAGE, BIT_DESCRIPTION, BIT_VERSION, [
    new Config(),
    new Remote(),
    new CatObject(),
    new CatComponent(),
    new CatLane(),
    new CatScope(),
    new CatVersionHistoryCmd(),
    new ScopeConfig(),
    new RunAction(),
  ]);
}
