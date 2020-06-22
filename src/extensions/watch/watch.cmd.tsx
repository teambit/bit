import React from 'react';
import { Color } from 'ink';
import { Command, CommandOptions } from '../cli';
import { Watch } from '.';

export class WatchCommand implements Command {
  name = 'watch';
  description = 'watch a set of components';
  alias = '';
  group = 'env';
  shortDescription = '';
  options = [['v', 'verbose', 'showing npm verbose output for inspection and prints stack trace']] as CommandOptions;

  constructor(private watch: Watch) {}

  async render(cliArgs: [], { verbose = false }: { verbose?: boolean }): Promise<React.ReactElement> {
    await this.watch.watch({ verbose });
    return <Color>watcher terminated</Color>;
  }
}
