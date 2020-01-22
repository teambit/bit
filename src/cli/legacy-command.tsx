import { Command, PaperOptions } from "../paper/command";
import LegacyInterface from './command'
import React from 'react'
import defaultErrorHandler from "./default-error-handler";
import { Color } from "ink";

export class LegacyCommand implements Command{
  alias: string;
  name: string;
  description: string;
  options: PaperOptions;

  constructor(private cmd: LegacyInterface) {
    this.name = cmd.name;
    this.description = cmd.description;
    this.options = cmd.opts;
    this.alias = cmd.alias;
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
