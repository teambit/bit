import { Command, CommandOptions } from '@teambit/cli';
import { PubsubMain } from '@teambit/pubsub';
import { Logger } from '@teambit/logger';

import React from 'react';
import open from 'open';

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
  devServerCounter = 0;
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

    private logger: Logger,

    private pubsub: PubsubMain
  ) {
    pubsub.subscribeToTopic('webpack-pubsub-topic', this.eventsListeners);
    pubsub.subscribeToTopic('ui-main', this.eventsListeners);
  }

  private eventsListeners = (event) => {
    console.log('---event-->: ', event);
    switch (event.type) {
      case 'webpack-compilation-done':
        this.devServerCounter--;
        break;
      case 'ui-server-started':
        this.devServerCounter++;
        break;
      default:
    }

    console.log('devServerCounter: ', this.devServerCounter);

    if (this.devServerCounter === 0) {
      open('http://localhost:3000/');
    }
  };

  private clearConsole() {
    process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H');
  }

  private onEvent(e) {
    console.log('-new event-> ', e.event);
  }

  async render(
    [uiRootName, userPattern]: [string, string],
    { dev, port, rebuild }: { dev: boolean; port: string; rebuild: boolean }
  ): Promise<React.ReactElement> {
    // console.log('--2->')
    // teambit.bit/variants should be the one to take care of component patterns.
    const pattern = userPattern && userPattern.toString();
    this.logger.off();
    const uiServer = await this.ui.createRuntime({
      onEvent: this.onEvent,
      uiRootName,
      pattern,
      dev,
      port: port ? parseInt(port) : undefined,
      rebuild,
    });

    // clear the user console before moving interactive.
    // this.clearConsole();

    // return <UIServerConsole uiServer={uiServer} />;
    return <BuildingDevServerOutput workspaceFilePath={'sdfsdf'} />;
  }
}
