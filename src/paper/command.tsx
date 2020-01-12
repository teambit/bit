import React, { Component } from 'react';
import Cmd, { CommandOption, CommandOptions } from '../cli/command';
import LegacyCommand from './legacy-command';
import { render } from 'ink';

export default class Command {
  constructor(
    /**
     * the name of the command. for example: 'add <> []'
     */
    readonly name: string,

    /**
     * the descriotion of the command. will be seen in 
     */
    readonly description: string,

    /**
     * 
     */
    readonly alias: string,

    /**
     * 
     */
    readonly opts: CommandOptions
  ) {}

  render() {
  }

  toLegacyFormat() {
    return new LegacyCommand(this);
  }
}
