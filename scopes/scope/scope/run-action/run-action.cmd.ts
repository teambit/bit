import { runAction } from './run-action';
import type { Command, CommandOptions } from '@teambit/cli';

export class RunActionCmd implements Command {
  name = 'run-action <action-name> <remote> <options>';
  description = 'run an action on a remote';
  private = true;
  alias = '';
  options = [] as CommandOptions;
  loadAspects = false;
  group = 'advanced';

  async report([actionName, remote, options]: [string, string, string]) {
    const optionsParsed = JSON.parse(options);
    const result = await runAction(actionName, remote, optionsParsed);
    return result || '';
  }
}
