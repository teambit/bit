import { Color } from 'ink';
import React from 'react';
import { Command, PaperOptions, GenericObject } from "../paper/command";
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

  private async action(params: any, options: { [key: string]: any }): Promise<string> {
    let report: string | null = null
    const res = await this.cmd.action(params, options, [] )
    let data = res;
    if (res && res.data !== undefined) {
      data = res.data;
    }
    report = this.cmd.report && this.cmd.report(data, params, options);
    return report;
  }

  async render(params: any, options: { [key: string]: any }): Promise<React.ReactElement> {
    const report = await this.action(params, options)
    return <Color>{report}</Color>
  }

  async json(params: any, options: { [key: string]: any }): Promise<GenericObject> {
    const report = await this.action(params, options)
    return JSON.parse(report);
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
