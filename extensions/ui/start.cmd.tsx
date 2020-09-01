import { Command, CommandOptions } from '@teambit/cli';
import React from 'react';

import { Logger } from '@teambit/logger';
import { UIServerConsole } from './bit-start-cmd-output-templates/env-console';
import type { UiMain } from './ui.main.runtime';

// import * as outputTemplates from './bit-start-cmd-output-templates';
import {
  BuildingDevServerOutput,
  CompilationEndedSuccessfullyOutput,
  CompilationErrorOutput,
  ComponentsRebuildOutput,
  DevServerRunningOutputTemplate,
  InitializeStartOutput,
} from './bit-start-cmd-output-templates';
import { addSharedDirForPath } from '../../dist/consumer/component-ops/manipulate-dir';

export class StartCmd implements Command {
  name = 'start [type] [pattern]';
  description = 'Start a dev environment for a workspace or a specific component';
  alias = 'c';
  group = 'component';
  shortDescription = '';
  options = [
    ['d', 'dev', 'start UI server in dev mode.'],
    ['p', 'port', 'port of the UI server.'],
    ['r', 'rebuild', 'rebuild the UI'],
  ] as CommandOptions;

  constructor(
    /**
     * access to the extension instance.
     */
    private ui: UiMain,

    private logger: Logger
  ) {}

  private clearConsole() {
    process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H');
  }

  async render(
    [uiRootName, userPattern]: [string, string],
    { dev, port, rebuild }: { dev: boolean; port: string; rebuild: boolean }
  ): Promise<React.ReactElement> {
    // teambit.bit/variants should be the one to take care of component patterns.
    const pattern = userPattern && userPattern.toString();
    this.logger.off();
    const uiServer = await this.ui.createRuntime({
      uiRootName,
      pattern,
      dev,
      port: port ? parseInt(port) : undefined,
      rebuild,
    });

    // clear the user console before moving interactive.
    this.clearConsole();

    // return <UIServerConsole uiServer={uiServer} />;
    return <BuildingDevServerOutput workspaceFilePath={'sdfsdf'} />;
  }
}
