// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Color } from 'ink';
import { Command, CLIArgs, PaperOptions } from '../paper';
import { Watch } from '.';

export class WatchCommand implements Command {
  name = 'watch';
  description = 'watch a set of components';
  alias = '';
  group = '';
  shortDescription = '';
  options = [['v', 'verbose', 'showing npm verbose output for inspection and prints stack trace']] as PaperOptions;

  constructor(private watch: Watch) {}

  async render(cliArgs: CLIArgs, { verbose = false }: { verbose?: boolean }) {
    await this.watch.watch({ verbose });
    return <Color>watcher terminated</Color>;
  }
}
