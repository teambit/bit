import { Color } from 'ink';
import React from 'react';
import { Command, PaperOptions } from "../paper/command";
import LegacyInterface from './command';
import defaultErrorHandler from "./default-error-handler";
import allHelp from './templates/all-help';
import { getID } from '../paper/registry';
import { Paper } from '../paper';

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

  async render(params: any, options: { [key: string]: any }): Promise<React.ReactElement> {
    let report:string | null = null
    const data = await this.cmd.action(params, options, [] )
    report = this.cmd.report && this.cmd.report(data, params, options)
    return <Color>{report}</Color>
  }
}


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
