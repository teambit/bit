import type { PubsubMain } from '@teambit/pubsub';

// Import the IDs & Events
import { BitBaseEvent } from '@teambit/pubsub';
import {
  WorkspaceAspect,
  OnComponentChangeEvent,
  OnComponentAddEvent,
  OnComponentRemovedEvent,
} from '@teambit/workspace';
import { UIAspect, UiServerStartedEvent } from '@teambit/ui';
import { WebpackAspect, WebpackCompilationDoneEvent } from '@teambit/webpack';
import { BundlerAspect, ComponentsServerStartedEvent } from '@teambit/bundler';

import React from 'react';
import { Newline, Text } from 'ink';
import open from 'open';

import {
  ClearConsole,
  Starting,
  ComponentPreviewServerStarted,
  UIServersAreReady,
  ComponentChange,
} from './output-templates';

export type props = {
  workspaceID: string;
  startingTimestamp: number;
  pubsub: PubsubMain;
  commandFlags: object;
};

export class CliOutput extends React.Component<props> {
  constructor(props: props) {
    super(props);
    this.state = {
      webpackRunningCompilationProcesses: 0,
      commandFlags: props.commandFlags,
      mainUIServer: null,
      componentServers: [],
      componentChanges: [],
      isBrowserOpen: false,
    };

    this.registerToEvents(props.pubsub);
  }

  private registerToEvents(pubsub) {
    pubsub.sub(UIAspect.id, this.eventsListener);
    pubsub.sub(WebpackAspect.id, this.eventsListener);
    pubsub.sub(BundlerAspect.id, this.eventsListener);
    pubsub.sub(WorkspaceAspect.id, this.eventsListener);
  }

  private eventsListener = (event: BitBaseEvent<any>) => {
    switch (event.type) {
      case ComponentsServerStartedEvent.TYPE:
        this.changeOrAddComponentServer(event.data, event.data.context.id, 'Running');
        if (this.areAllComponentServersRunning()) {
          this.safeOpenBrowser();
        }
        break;
      case WebpackCompilationDoneEvent.TYPE: // TODO: add Errors & Warnings: event.data.stats.compilation.errors/warnings
        this.onWebpackCompilationDone(event);
        break;
      case UiServerStartedEvent.TYPE:
        this.onUiServerStarted(event);
        break;
      case OnComponentChangeEvent.TYPE:
        this.onComponentChange(event);
        break;
      case OnComponentAddEvent.TYPE:
        this.onComponentAdd(event);
        break;
      case OnComponentRemovedEvent.TYPE:
        this.onComponentRemoved(event);
        break;
      default:
    }
  };

  private async onUiServerStarted(event) {
    const devServers = await event.data.uiRoot.devServers;
    devServers.forEach((server) => {
      this.changeOrAddComponentServer(server, server.context.id, 'Started');
    });
    this.setState({
      mainUIServer: event.data,
    });

    if (!devServers.length) {
      this.safeOpenBrowser();
    }
  }

  // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
  private onWebpackCompilationDone = (_event) => {
    this.setState({
      webpackRunningCompilationProcesses: this.state.webpackRunningCompilationProcesses + 1,
    });
  };

  private onComponentChange(event) {
    this.setState({
      componentChanges: [...this.state.componentChanges, event],
    });
  }

  private onComponentRemoved = (event) => {
    this.onComponentChange(event);
  };

  private onComponentAdd = (event) => {
    this.onComponentChange(event);
  };

  // Hellpers

  private areAllComponentServersRunning() {
    //TODO: should not be hardcoded
    return this.state.componentServers.filter((cs) => cs.status === 'Running').length >= 3;
  }

  private safeOpenBrowser() {
    const { suppressBrowserLaunch } = this.state.commandFlags;
    const { isBrowserOpen, mainUIServer } = this.state;

    if (mainUIServer && !isBrowserOpen && !suppressBrowserLaunch) {
      this.setState({ isBrowserOpen: true });
      setTimeout(() => open(`http://${mainUIServer.targetHost}:${mainUIServer.targetPort}/`), 500);
    }
  }

  private changeOrAddComponentServer(server, id, status) {
    this.setState({
      componentServers: [...this.state.componentServers.filter((cs) => cs.id !== id), { server, id, status }],
    });
  }

  render() {
    const { webpackRunningCompilationProcesses, componentServers, mainUIServer, componentChanges } = this.state;
    const { verbose } = this.state.commandFlags;
    return (
      <>
        <ClearConsole verbose={!!verbose} />
        <ComponentChange events={componentChanges} />

        <Starting componentServers={componentServers} />
        <Newline />

        <ComponentPreviewServerStarted items={componentServers} />
        <Newline />

        <UIServersAreReady mainUIServer={mainUIServer} />
      </>
    );
  }
}
