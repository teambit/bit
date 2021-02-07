import { runAction } from '../../../api/scope/lib/run-action';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class RunAction implements LegacyCommand {
  name = 'run-action <action-name> <remote> <options>';
  description = 'run an action on a remote';
  private = true;
  alias = '';
  opts = [] as CommandOptions;

  action([actionName, remote, options]: [string, string, string]): Promise<any> {
    const optionsParsed = JSON.parse(options);
    return runAction(actionName, remote, optionsParsed);
  }

  report(results): string {
    return results;
  }
}
