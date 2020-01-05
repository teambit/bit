import { Component } from 'react';
import Cmd, { CommandOption, CommandOptions } from '../cli/command';
import LegacyCommand from './legacy-command';
import { render } from 'ink';

export default class Command {
  constructor(
    readonly name: string,
    readonly description: string,
    readonly alias: string,
    readonly opts: CommandOptions
  ) {}

  render(Root: Component) {
    render(<Root />);
  }

  toLegacyFormat() {
    return new LegacyCommand(this);
  }
}
