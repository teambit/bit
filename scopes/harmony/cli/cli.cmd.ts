import { Command, CommandOptions } from '@teambit/cli';
import { CLIMain } from './cli.main.runtime';
import { GenerateCommandsDoc } from './generate-doc-md';

export class CliCmd implements Command {
  name = 'cli';
  description = 'shows all available commands';
  alias = '';
  loader = false;
  group = 'general';
  options = [['', 'generate', 'generate an .md file']] as CommandOptions;

  constructor(private cliMain: CLIMain) {}

  async report(args, { generate }: { generate: boolean }) {
    if (generate) return new GenerateCommandsDoc(this.cliMain.commands).generate();
    return this.cliMain.commands
      .filter((cmd) => !cmd.private)
      .map((cmd) => `${cmd.name}`)
      .join('\n');
  }
}
