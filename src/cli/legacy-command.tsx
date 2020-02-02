import { Color, AppContext } from 'ink';
import React from 'react';
import { Command, PaperOptions, GenericObject } from "../extensions/paper/command";
import LegacyInterface from './command';
import allHelp from './templates/all-help';
import { getID } from '../extensions/paper/registry';
import { Paper } from '../extensions/paper';

export class LegacyCommand implements Command{
  alias: string;
  name: string;
  description: string;
  options: PaperOptions;
  shortDescription: string;
  group: string;
  loader?: boolean;
  commands: Command[];
  private?: boolean
  constructor(private cmd: LegacyInterface, p:Paper) {
    this.name = cmd.name;
    this.description = cmd.description;
    this.options = cmd.opts;
    this.alias = cmd.alias;
    const commandID = getID(cmd.name)
    const {summery, group} = findLegacyDetails(commandID, p)
    this.shortDescription = summery
    this.group = group
    this.loader = cmd.loader

    this.commands = cmd.commands.map((sub) => {
      return new LegacyCommand(sub, p)
    })
  }

  private async action(params: any, options: { [key: string]: any }, packageManagerArgs?: string[]): Promise<ActionResult> {
    let report: string | null = null
    const res = await this.cmd.action(params, options, packageManagerArgs)
    let data = res;
    if (res && res.data !== undefined) {
      data = res.data;
    }
    report = this.cmd.report && this.cmd.report(data, params, options);
    return {
      code: res.__code || 0,
      report
    }
  }

  async render(params: any, options: { [key: string]: any }, packageManagerArgs?: string[]): Promise<React.ReactElement> {
    const actionResult = await this.action(params, options, packageManagerArgs)
    return <LegacyRender {...{out: actionResult.report, code: actionResult.code }}></LegacyRender>
  }

  async json(params: any, options: { [key: string]: any }, packageManagerArgs?: string[]): Promise<GenericObject> {
    const actionResult = await this.action(params, options, packageManagerArgs)
    return {
      data: JSON.parse(actionResult.report),
      code: actionResult.code
    }
  }
}

// TODO: remove all help and move information to commands
export function findLegacyDetails(name:string, p:Paper) {
  let group = ''
  let summery = ''
  for (let i =0; i<allHelp.length; i+=1) {
    const index = allHelp[i].commands.findIndex((command)=>command.name === name)
    // eslint-disable-next-line no-bitwise
    if (~index) {
      group = allHelp[i].group
      summery = allHelp[i].commands[index].description
      !p.groups[group] && p.registerGroup(group, allHelp[i].title)
    }
  }
  return {group, summery}
}

export function LegacyRender(props:{out:string, code:number}){
  return <AppContext.Consumer>
    {({exit})=> {
      setTimeout(()=> {
        exit()
      }, 0)

      return <Color>{props.out}</Color>
    }}
  </AppContext.Consumer>
}

type ActionResult = {
  code: number,
  report: string
}
