import type { Command, CommandOptions } from '@teambit/cli';
import type { ScriptsMain } from './scripts.main.runtime';

export type ScriptOptions = {
  list?: boolean;
};

export class ScriptCmd implements Command {
  name = 'script [script-name]';
  description = 'run a script defined by the environment';
  extendedDescription = `executes custom scripts defined by component environments.
scripts can be shell commands or JavaScript functions defined in env.scripts().
runs the script for all components grouped by their environment.
use --list to see all available scripts.`;
  arguments = [
    {
      name: 'script-name',
      description: 'the name of the script to run (e.g., "generate-svg", "pre-snap")',
    },
  ];
  alias = '';
  group = 'development';
  options = [['l', 'list', 'list all available scripts from all environments']] as CommandOptions;

  constructor(private scripts: ScriptsMain) {}

  async report(args: string[], options: ScriptOptions): Promise<string> {
    const [scriptName] = args;

    if (options.list) {
      return this.scripts.listAllScripts();
    }

    if (!scriptName) {
      throw new Error('script name is required. Use --list to see available scripts.');
    }

    return this.scripts.runScript(scriptName);
  }
}
