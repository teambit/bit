import React from 'react';
import { Color } from 'ink';
import { Command, CommandOptions } from '../cli';
import { WatcherExtension } from './watch.extension';

export class WatchCommand implements Command {
  name = 'watch';
  description = 'watch a set of components';
  alias = '';
  group = 'env';
  shortDescription = '';
  options = [['v', 'verbose', 'showing npm verbose output for inspection and prints stack trace']] as CommandOptions;

  constructor(
    /**
     * watcher extension.
     */
    private watch: WatcherExtension
  ) {}

  // :TODO we should only use `report` here. no reason for interactive.
  async render(cliArgs: [], { verbose = false }: { verbose?: boolean }): Promise<React.ReactElement> {
    await this.watch.watch({ verbose });
    return <Color>watcher terminated</Color>;
  }
}
