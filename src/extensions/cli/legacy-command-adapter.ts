import { Command, PaperOptions, GenericObject } from '.';
import { LegacyCommand } from '../../cli/legacy-command';
import allHelp from '../../cli/templates/all-help';
import { getID } from '.';
import { CLIExtension } from './cli.extension';

export class LegacyCommandAdapter implements Command {
  alias: string;
  name: string;
  description: string;
  options: PaperOptions;
  shortDescription: string;
  group: string;
  loader?: boolean;
  commands: Command[];
  private?: boolean;
  migration?: boolean;
  constructor(private cmd: LegacyCommand, cliExtension: CLIExtension) {
    this.name = cmd.name;
    this.description = cmd.description;
    this.options = cmd.opts || [];
    this.alias = cmd.alias;
    const commandID = getID(cmd.name);
    const { summery, group } = findLegacyDetails(commandID, cliExtension);
    this.shortDescription = summery;
    this.group = group;
    this.loader = cmd.loader;
    this.private = cmd.private;
    this.migration = cmd.migration;
    this.commands = (cmd.commands || []).map(sub => new LegacyCommandAdapter(sub, cliExtension));
  }

  private async action(params: any, options: { [key: string]: any }): Promise<ActionResult> {
    let report: string | null = null;
    //  packageManagerArgs is injected here for legacy reasons.
    const res = await this.cmd.action(params, options, (this as any).packageManagerArgs || []);
    let data = res;
    if (res && res.data !== undefined) {
      data = res.data;
    }
    report = this.cmd.report && this.cmd.report(data, params, options);
    return {
      code: res?.__code || 0,
      report: report || ''
    };
  }

  async report(params: any, options: { [key: string]: any }): Promise<{ data: string; code: number }> {
    const actionResult = await this.action(params, options);
    return { data: actionResult.report, code: actionResult.code };
  }

  async json(params: any, options: { [key: string]: any }): Promise<GenericObject> {
    const actionResult = await this.action(params, options);
    return {
      data: JSON.parse(actionResult.report),
      code: actionResult.code
    };
  }
}

// TODO: remove all help and move information to commands
export function findLegacyDetails(name: string, p: CLIExtension) {
  let group = '';
  let summery = '';
  for (let i = 0; i < allHelp.length; i += 1) {
    const index = allHelp[i].commands.findIndex(command => command.name === name);
    // eslint-disable-next-line no-bitwise
    if (~index) {
      group = allHelp[i].group;
      summery = allHelp[i].commands[index].description;
      !p.groups[group] && p.registerGroup(group, allHelp[i].title);
    }
  }
  return { group, summery };
}

type ActionResult = {
  code: number;
  report: string;
};
