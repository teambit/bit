// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { useState, useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Box, Color, Text } from 'ink';
// import { EnvConsole } from './components';
// make sure to update eslint to read JSX.
import { Command } from '../cli';
import { UIExtension } from './ui.extension';
import { EnvConsole } from './env-console';

export class StartCmd implements Command {
  name = 'start [type] [pattern]';
  description = 'start a dev environment for a workspace or a specific component';
  alias = 'c';
  private = true;
  group = 'development';
  shortDescription = '';
  options = [];

  constructor(
    /**
     * access to the extension instance.
     */
    private ui: UIExtension
  ) {}

  private clearConsole() {
    process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H');
  }

  async render([type, userPattern]: [string, string]): Promise<React.ReactElement> {
    const DEFAULT_UI = '@teambit/workspace';
    if (type === 'scope') type = '@teambit/scope';
    // @teambit/variants should be the one to take care of component patterns.
    const pattern = userPattern && userPattern.toString();
    const uiRuntime = await this.ui.createRuntime(type || DEFAULT_UI, pattern);
    // this.clearConsole();
    // @ts-ignore
    // uiRuntime.dev();
    // this.clearConsole();
    return <EnvConsole runtime={uiRuntime} />;
  }
}
