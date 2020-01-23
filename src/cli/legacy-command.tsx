import { Color } from 'ink';
import React from 'react';
import { Command, PaperOptions } from "../paper/command";
import LegacyInterface from './command';
import defaultErrorHandler from "./default-error-handler";
import allHelp from './templates/all-help';

export class LegacyCommand implements Command{
  alias: string;
  name: string;
  description: string;
  options: PaperOptions;
  summery: string;
  group: string;
  loader?: boolean;
  commands: Command[];

  constructor(private cmd: LegacyInterface) {
    this.name = cmd.name;
    this.description = cmd.description;
    this.options = cmd.opts;
    this.alias = cmd.alias;
    const {summery, group} = findLegacyDetails(cmd.name)
    this.summery = summery
    this.group = group
    this.loader = cmd.loader
    this.commands = cmd.commands.map((sub) => {
      return new LegacyCommand(sub)
    })
  }

  async render(params: any, options: { [key: string]: any }): Promise<React.ReactElement> {
    let report:string | null = null
    try {
      const data = await this.cmd.action(params, options, [] )
      report = this.cmd.report && this.cmd.report(data, params, options)
    } catch(e) {
      report = defaultErrorHandler(e) || e.message
    }
    return <Color>{report}</Color>
  }
}


export function findLegacyDetails(name:string) {
  let group = ''
  let summery = ''
  for (let i =0; i<allHelp.length; i+=1) {
    const index = allHelp[i].commands.findIndex((command)=>command.name === name)
    // eslint-disable-next-line no-bitwise
    if (~index) {
      group = allHelp[i].title
      summery = allHelp[i].commands[index].description
    }
  }

  return {group, summery}
}
