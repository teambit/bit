import { BIT_DESCRIPTION, BIT_USAGE, BIT_VERSION } from '../constants';
import CommandRegistry from './command-registry';
import Remote from './commands/public-cmds/remote-cmd';

export default function registerCommands(): CommandRegistry {
  return new CommandRegistry(BIT_USAGE, BIT_DESCRIPTION, BIT_VERSION, [new Remote()]);
}
