import chalk from 'chalk';
import React from 'react';
import { Color } from 'ink';
import { Command, CommandOptions } from '../cli';
import Workspace, { EjectConfOptions, EjectConfResult } from './workspace';

type EjectConfArgs = [string];

export default class EjectConfCmd implements Command {
  name = 'eject-conf [id]';
  description = 'ejecting components configuration';
  alias = '';
  group = 'component';
  shortDescription = 'ejecting components configuration';
  options = [['p', 'propagate [boolean]', 'mark propagate true in the config file']] as CommandOptions;

  constructor(private workspace: Workspace) {}

  // TODO: remove this ts-ignore
  // @ts-ignore
  async render(args: EjectConfArgs, options: EjectConfOptions) {
    const ejectResult = await this.json(args, options);
    return (
      <Color green>
        Successfully ejected config for component {ejectResult.componentId} in path {ejectResult.configPath}
      </Color>
    );
  }

  async report(args: EjectConfArgs, options: EjectConfOptions): Promise<string> {
    const ejectResult = await this.json(args, options);
    return `Successfully ejected config for component ${chalk.bold(ejectResult.componentId)} in path ${chalk.green(
      ejectResult.configPath
    )}`;
  }

  async json([componentId]: EjectConfArgs, options: EjectConfOptions): Promise<EjectConfResult> {
    const results = await this.workspace.ejectConfig(componentId, options);
    return results;
  }
}
