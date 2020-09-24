/**
 * TODO[uri] - refactor to full blown React app (with state).
 */
import { Command, CommandOptions } from '@teambit/cli';
import { PubsubMain } from '@teambit/pubsub';
import { Logger } from '@teambit/logger';
import {
  WorkspaceAspect,
  OnComponentChangeEvent,
  OnComponentAddEvent,
  OnComponentRemovedEvent,
} from '@teambit/workspace';

import { ComponentsServerStartedEvent } from '@teambit/bundler';
import { UiServerStartedEvent } from '@teambit/ui';
import { WebpackCompilationDoneEvent } from '@teambit/webpack';

import React from 'react';
import open from 'open';
import { render } from 'ink';
import humanizeDuration from 'humanize-duration';
import moment from 'moment';

import type { UiMain } from './ui.main.runtime';
import {
  OnComponentChange,
  StartingMainUiServer,
  StandaloneNewLine,
  Starting,
  ClearConsole,
  ComponentPreviewServerStarted,
  UIServersAreReady,
} from './bit-start-cmd-output-templates';

export class StartCmd implements Command {
  items: any[] = [];
  onComponentChanges: any[] = [];

  startingtimestamp;
  devServerCounter = 0;
  targetHost = 'localhost';
  targetPort = 3000;
  name = 'start [type] [pattern]';
  description = 'Start a dev environment for a workspace or a specific component';
  alias = 'c';
  group = 'component';
  shortDescription = '';
  options = [
    ['d', 'dev', 'start UI server in dev mode.'],
    ['p', 'port', 'port of the UI server.'],
    ['r', 'rebuild', 'rebuild the UI'],
    ['v', 'verbose', 'showing verbose output for inspection and prints stack trace'],
  ] as CommandOptions;

  constructor(
    /**
     * access to the extension instance.
     */
    private ui: UiMain,

    private logger: Logger,

    private pubsub: PubsubMain
  ) {}

  private registerToEvents() {
    this.pubsub.sub('teambit.bit/ui', this.eventsListeners);
    this.pubsub.sub('teambit.bit/webpack', this.eventsListeners);
    this.pubsub.sub('teambit.bit/bundler', this.eventsListeners);
    this.pubsub.sub('teambit.bit/workspace', this.eventsListeners);
  }

  private eventsListeners = (event) => {
    switch (event.type) {
      case ComponentsServerStartedEvent.TYPE:
        // Do not remove thetimeout or the component might be removed by theClearConsole(!)
        setTimeout(() => this.onComponentsServerStarted(event), 300);
        break;
      // case 'webpack-compilation-done':
      case WebpackCompilationDoneEvent.TYPE:
        // Do not remove thetimeout or the component might be removed by theClearConsole(!)
        setTimeout(() => this.onWebpackCompilationDone(event), 0);
        break;
      case UiServerStartedEvent.TYPE:
        this.onUiServerStarted(event);
        break;
      case OnComponentChangeEvent.TYPE:
        this.onComponentChange(event);
        break;
      case OnComponentAddEvent.TYPE:
        this.OnComponentAdd(event);
        break;
      case OnComponentRemovedEvent.TYPE:
        this.OnComponentRemoved(event);
        break;
      default:
    }
  };

  private OnComponentRemoved = (event) => {
    this.onComponentChange(event);
  };

  private OnComponentAdd = (event) => {
    this.onComponentChange(event);
  };

  private onComponentChange = (event) => {
    const { hook, idStr } = event.data;
    this.onComponentChanges.push({
      hook,
      idStr,
      timestamp: moment().format('HH:mm:ss'),
    });

    render(
      <>
        <ComponentPreviewServerStarted items={this.items} />
        <StandaloneNewLine />
        <UIServersAreReady
          host={this.targetHost}
          port={this.targetPort}
          timestamp={this.getDuration()}
          workspace={WorkspaceAspect}
        />
        <StandaloneNewLine />
        <OnComponentChange events={this.onComponentChanges} />
      </>
    );
  };

  private onUiServerStarted = (event) => {
    this.targetHost = event.data.targetHost;
    this.targetPort = event.data.targetPort;
  };

  // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
  private onWebpackCompilationDone = (_event) => {
    this.devServerCounter -= 1;
    this.openBrowserOn0();
  };

  private onComponentsServerStarted(event) {
    this.devServerCounter += 1;
    this.items.push({
      envName: event.data.executionContext.envRuntime.id,
      host: event.data.hostname,
      port: event.data.port,
      timestamp: this.getDuration(),
    });
    render(
      <>
        <ComponentPreviewServerStarted items={this.items} />
        <StandaloneNewLine />
        <StartingMainUiServer workspace={WorkspaceAspect} />
      </>
    );
  }

  private openBrowserOn0() {
    if (this.devServerCounter === 0) {
      render(
        <>
          <ComponentPreviewServerStarted items={this.items} />
          <StandaloneNewLine />
          <UIServersAreReady
            host={this.targetHost}
            port={this.targetPort}
            timestamp={this.getDuration()}
            workspace={WorkspaceAspect}
          />
        </>
      );

      setTimeout(() => open(`http://${this.targetHost}:${this.targetPort}/`), 500);
    }
  }

  private getDuration() {
    const duration = Date.now() - this.startingtimestamp;
    return humanizeDuration(duration);
  }

  async render(
    [uiRootName, userPattern]: [string, string],
    { dev, port, rebuild, verbose }: { dev: boolean; port: string; rebuild: boolean; verbose: boolean }
  ): Promise<React.ReactElement> {
    this.startingtimestamp = Date.now();

    // TODO[uri]: move outside when refactor to react app.
    this.registerToEvents();
    const pattern = userPattern && userPattern.toString();
    this.logger.off();
    await this.ui.createRuntime({
      uiRootName,
      pattern,
      dev,
      port: port ? parseInt(port) : undefined,
      rebuild,
    });

    return (
      <>
        {verbose ? <StandaloneNewLine /> : <ClearConsole />}
        <Starting workspace={WorkspaceAspect} />
      </>
    );
  }
}
