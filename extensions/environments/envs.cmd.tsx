import { Command, CLIArgs, Flags } from '@teambit/cli';
import { EnvsMain } from './environments.main.runtime';

export class EnvsCmd implements Command {
  name = 'envs';
  alias = 'e';
  shortDescription = 'show all component envs';
  description = 'show all components envs';
  options = [];
  group = 'component';

  constructor(private envs: EnvsMain) {}

  render(args: CLIArgs, flags: Flags): Promise<React.ReactElement> {}
}
