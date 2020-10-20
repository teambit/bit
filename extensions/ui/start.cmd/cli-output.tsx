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
import { CompilerAspect, CompilerErrorEvent } from '@teambit/compiler';

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

type state = {
  commandFlags: any;
  mainUIServer: any;
  componentServers: Array<any>;
  componentChanges: Array<any>;
  isBrowserOpen: boolean;
  latestError: any;
  webpackErrors: Array<any>;
  webpackWarnings: Array<any>;
};

export type props = {
  workspaceID: string;
  startingTimestamp: number;
  pubsub: PubsubMain;
  commandFlags: any;
};

export class CliOutput extends React.Component<props, state> {
  constructor(props: props) {
    super(props);
    this.state = {
      commandFlags: props.commandFlags,
      mainUIServer: null,
      componentServers: [],
      componentChanges: [],
      isBrowserOpen: false,
      latestError: null,
      webpackErrors: [],
      webpackWarnings: [],
    };

    this.registerToEvents(props.pubsub);
  }

  private registerToEvents(pubsub) {
    pubsub.sub(UIAspect.id, this.eventsListener);
    pubsub.sub(WebpackAspect.id, this.eventsListener);
    pubsub.sub(BundlerAspect.id, this.eventsListener);
    pubsub.sub(WorkspaceAspect.id, this.eventsListener);
    pubsub.sub(CompilerAspect.id, this.eventsListener);
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
      case CompilerErrorEvent.TYPE:
        this.setState({
          latestError: event.data.error,
        });
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

  private onWebpackCompilationDone = (event) => {
    this.setState({
      webpackErrors: [...event.data.stats.compilation.errors],
      webpackWarnings: [...event.data.stats.compilation.warnings],
    });
  };

  private onComponentChange(event) {
    this.setState({
      componentChanges: [...this.state.componentChanges, event],
      latestError: null,
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
    return this.state.componentServers.filter((cs) => cs.status !== 'Running').length === 0;
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
    const {
      componentServers,
      mainUIServer,
      componentChanges,
      latestError,
      webpackErrors,
      webpackWarnings,
    } = this.state;
    const { verbose } = this.state.commandFlags;

    // run in scope
    if (mainUIServer && mainUIServer.uiRoot.scope) {
      return <UIServersAreReady mainUIServer={mainUIServer} />;
    }

    return (
      <>
        {latestError ? null : <ComponentChange events={componentChanges} />}

        {mainUIServer ? null : <Starting componentServers={componentServers} />}
        <Newline />

        <ComponentPreviewServerStarted items={componentServers} />
        <Newline />

        {latestError ? (
          verbose ? (
            <Text>Error: {latestError.stack}</Text>
          ) : (
            <Text>Error: {latestError.message}</Text>
          )
        ) : null}

        {webpackErrors.map((err) => (
          <Text>Error: {err}</Text>
        ))}

        {webpackWarnings.map((warning) => (
          <Text>Warning: {warning}</Text>
        ))}

        <UIServersAreReady mainUIServer={mainUIServer} />
      </>
    );
  }
}
