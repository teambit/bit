import React from 'react';
import { Command, CommandOptions } from '../cli';
import type { UiMain } from './ui.main.runtime';
import { UIServerConsole } from './env-console';

export class StartCmd implements Command {
  name = 'start [type] [pattern]';
  description = 'start a dev environment for a workspace or a specific component';
  alias = 'c';
  private = true;
  group = 'development';
  shortDescription = '';
  options = [
    ['d', 'dev', 'start UI server in dev mode.'],
    ['p', 'port', 'port of the UI server.'],
  ] as CommandOptions;

  constructor(
    /**
     * access to the extension instance.
     */
    private ui: UiMain
  ) {}

  private clearConsole() {
    process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H');
  }

  async render(
    [uiRootName, userPattern]: [string, string],
    { dev, port }: { dev: boolean; port: string }
  ): Promise<React.ReactElement> {
    // @teambit/variants should be the one to take care of component patterns.
    const pattern = userPattern && userPattern.toString();
    const uiServer = await this.ui.createRuntime({
      uiRootName,
      pattern,
      dev,
      port: port ? parseInt(port) : undefined,
    });

    // clear the user console before moving interactive.
    this.clearConsole();

    return <UIServerConsole uiServer={uiServer} />;
  }
}
