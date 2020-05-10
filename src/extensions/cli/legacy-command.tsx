// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Color, AppContext } from 'ink';
import React from 'react';
import { Command, PaperOptions, GenericObject } from '../paper';
import LegacyInterface from '../../cli/command';
import allHelp from '../../cli/templates/all-help';
import { getID } from '../paper';
import { Paper } from '../paper';

export class LegacyCommand implements Command {
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
  constructor(private cmd: LegacyInterface, p: Paper) {
    this.name = cmd.name;
    this.description = cmd.description;
    this.options = cmd.opts;
    this.alias = cmd.alias;
    const commandID = getID(cmd.name);
    const { summery, group } = findLegacyDetails(commandID, p);
    this.shortDescription = summery;
    this.group = group;
    this.loader = cmd.loader;
    this.private = cmd.private;
    this.migration = cmd.migration;

    this.commands = cmd.commands.map(sub => {
      return new LegacyCommand(sub, p);
    });
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
      report
    };
  }

  async render(params: any, options: { [key: string]: any }): Promise<React.ReactElement> {
    const actionResult = await this.action(params, options);
    return <LegacyRender {...{ out: actionResult.report, code: actionResult.code }}></LegacyRender>;
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
export function findLegacyDetails(name: string, p: Paper) {
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

export function LegacyRender(props: { out: string; code: number }) {
  return (
    <AppContext.Consumer>
      {({ exit }) => {
        setTimeout(() => {
          exit();
        }, 0);

        return <Color>{props.out}</Color>;
      }}
    </AppContext.Consumer>
  );
}

type ActionResult = {
  code: number;
  report: string;
};
