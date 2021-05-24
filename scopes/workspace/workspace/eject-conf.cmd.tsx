import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { Text } from 'ink';
import React from 'react';

import { EjectConfOptions, EjectConfResult, Workspace } from './workspace';

type EjectConfArgs = [string];
// From the cli we might get those as string in case we run it like --propagate true (return string) as opposed to only --propagate
type EjectConfOptionsCLI = {
  propagate: string | boolean | undefined;
  override: string | boolean | undefined;
};

export default class EjectConfCmd implements Command {
  name = 'eject-conf [id]';
  description = 'ejecting components configuration';
  alias = '';
  group = 'development';
  shortDescription = 'eject the target component configuration file (e.g. create a `component.json` file)';
  options = [
    ['p', 'propagate [boolean]', 'mark propagate true in the config file'],
    ['o', 'override [boolean]', 'override file if exist'],
  ] as CommandOptions;

  constructor(private workspace: Workspace) {}

  // TODO: remove this ts-ignore
  // @ts-ignore
  async render(args: EjectConfArgs, options: EjectConfOptionsCLI) {
    const ejectResult = await this.json(args, options);
    const [componentId] = args;
    return (
      <Text color="yellow">
        successfully ejected config for component {componentId} in path {ejectResult.configPath}
      </Text>
    );
  }

  async report(args: EjectConfArgs, options: EjectConfOptionsCLI): Promise<string> {
    const ejectResult = await this.json(args, options);
    const [componentId] = args;
    return `successfully ejected config for component ${chalk.bold(componentId)} in path ${chalk.green(
      ejectResult.configPath
    )}`;
  }

  async json([componentId]: EjectConfArgs, options: EjectConfOptionsCLI): Promise<EjectConfResult> {
    const ejectOptions = options;
    if (ejectOptions.propagate === 'true') {
      ejectOptions.propagate = true;
    }
    if (ejectOptions.override === 'true') {
      ejectOptions.override = true;
    }

    const id = await this.workspace.resolveComponentId(componentId);

    const results = await this.workspace.ejectConfig(id, ejectOptions as EjectConfOptions);
    return results;
  }
}
