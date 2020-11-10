/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unused-vars */

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
import { WebpackAspect, WebpackCompilationDoneEvent, WebpackCompilationStartedEvent } from '@teambit/webpack';
import { BundlerAspect, ComponentsServerStartedEvent } from '@teambit/bundler';
import { CompilerAspect, CompilerErrorEvent } from '@teambit/compiler';

import React from 'react';
import { Newline, Text, render } from 'ink';
import open from 'open';

import {
  Starting,
  ComponentPreviewServerStarted,
  UIServersAreReadyInScope,
  WebpackErrors,
  WebpackWarnings,
  CompilingOrUIServersAreReady,
} from './output-templates';

type state = {
  compiledComponents: Array<any>;
  commandFlags: any;
  mainUIServer: any;
  componentServers: Array<any>;
  webpackErrors: Array<any>;
  webpackWarnings: Array<any>;
  totalComponents: Array<any> | null;
  isScope: boolean;
  compiling: boolean;
};

export type props = {
  startingTimestamp: number;
  pubsub: PubsubMain;
  commandFlags: any;
  uiServer: any;
};

export class CliOutput extends React.Component<props, state> {
  private isBrowserOpen = false;

  constructor(props: props) {
    super(props);
    this.state = {
      compiledComponents: [],
      commandFlags: props.commandFlags,
      mainUIServer: props.uiServer,
      componentServers: [],
      webpackErrors: [],
      webpackWarnings: [],
      totalComponents: null,
      isScope: !!props.uiServer?.uiRoot.scope,
      compiling: false,
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
        this.updateOrAddComponentServer(event.data.context.id, 'Starting...', event.data);
        this.safeOpenBrowser();
        break;
      case WebpackCompilationStartedEvent.TYPE:
        this.onWebpackCompilationStarted(event as WebpackCompilationStartedEvent);
        break;
      case WebpackCompilationDoneEvent.TYPE:
        this.onWebpackCompilationDone(event as WebpackCompilationDoneEvent);
        break;
      case UiServerStartedEvent.TYPE:
        this.onUiServerStarted(event as UiServerStartedEvent);
        break;
      case OnComponentChangeEvent.TYPE:
        this.onComponentChange(event as OnComponentChangeEvent);
        break;
      case OnComponentAddEvent.TYPE:
        this.onComponentAdd(event as OnComponentAddEvent);
        break;
      case OnComponentRemovedEvent.TYPE:
        this.onComponentRemoved(event as OnComponentRemovedEvent);
        break;
      case CompilerErrorEvent.TYPE:
        // TODO: for now completely ignoring compiler errors.
        break;
      default:
    }
  };

  private async onUiServerStarted(event: UiServerStartedEvent) {
    const devServers = await event.data.uiRoot.devServers;

    if (event.data.uiRoot.scope) {
      this.setState({
        mainUIServer: event.data,
        isScope: true,
      });
    } else {
      const totalComponents = await event.data.uiRoot.workspace.list();
      this.setState({
        mainUIServer: event.data,
        totalComponents,
      });
    }

    if (!devServers.length) {
      this.unsafeOpenBrowser(this.state.mainUIServer);
    } else {
      this.safeOpenBrowser();
    }
  }

  private onWebpackCompilationStarted = (_event: WebpackCompilationStartedEvent) => {
    if (this.isOnRunningMode()) {
      this.clearConsole();
      this.setState({
        webpackErrors: [],
        webpackWarnings: [],
        compiling: true,
      });
    }
  };

  private onWebpackCompilationDone = (event: WebpackCompilationDoneEvent) => {
    const successfullyCompiledComponents = event.data.stats.compilation.errors.length ? [] : [event.data.stats.hash];
    this.setState({
      webpackErrors: [...event.data.stats.compilation.errors],
      webpackWarnings: [...event.data.stats.compilation.warnings],
      compiledComponents: [...this.state.compiledComponents, ...successfullyCompiledComponents],
      compiling: false,
    });
    this.updateOrAddComponentServer(event.data.devServerID, 'Running');
    this.safeOpenBrowser();
  };

  // TODO: What to do here?
  private onComponentChange(_event: OnComponentChangeEvent) {}

  private onComponentRemoved = (_event: OnComponentRemovedEvent) => {
    // this.onComponentChange(event);
  };

  private onComponentAdd = (_event: OnComponentAddEvent) => {
    // this.onComponentChange(event);
  };

  // Helpers
  private isOnRunningMode() {
    return this.state.mainUIServer && this.state.componentServers.every((cs) => cs.status === 'Running');
  }

  private clearConsole() {
    process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H');
  }

  private async safeOpenBrowser() {
    const { suppressBrowserLaunch } = this.state.commandFlags;
    const { mainUIServer } = this.state;

    if (mainUIServer && !suppressBrowserLaunch && !!this.state.compiledComponents.length) {
      // TODO(uri): Bug two events for each server
      if (this.state.compiledComponents.length / 2 >= this.state.componentServers.length) {
        this.unsafeOpenBrowser(mainUIServer);
      }
    }
  }

  private unsafeOpenBrowser(mainUIServer) {
    const { suppressBrowserLaunch } = this.state.commandFlags;

    if (!this.isBrowserOpen && !suppressBrowserLaunch) {
      this.isBrowserOpen = true;
      setTimeout(() => open(`http://${mainUIServer.targetHost}:${mainUIServer.targetPort}/`), 500);
    }
  }

  private updateOrAddComponentServer(id, status, server?) {
    if (server) {
      this.addOrUpdateComponentServer(id, status, server);
    } else {
      this.updateComponentServerStatus(id, status);
    }
  }

  private updateComponentServerStatus(id, status) {
    const server = this.state.componentServers.find((cs) => cs.id === id)?.server;
    if (server) {
      this.addOrUpdateComponentServer(id, status, server);
    }
  }

  private addOrUpdateComponentServer(id, status, server) {
    this.setState({
      componentServers: [...this.state.componentServers.filter((cs) => cs.id !== id), { server, id, status }],
    });
  }

  render() {
    const {
      componentServers,
      mainUIServer,
      webpackErrors,
      webpackWarnings,
      compiledComponents,
      isScope,
      compiling,
    } = this.state;
    const { verbose } = this.state.commandFlags;

    // run in scope
    if (isScope) {
      render(<UIServersAreReadyInScope mainUIServer={mainUIServer} />);
      return null;
    }

    if (webpackErrors.length) {
      return <WebpackErrors errs={webpackErrors} verbose={!!verbose} />;
    }

    if (webpackWarnings.length) {
      return <WebpackWarnings warnings={webpackWarnings} verbose={!!verbose} />;
    }

    if (compiling) {
      return <Text>Compiling...</Text>;
    }

    return (
      <>
        <ComponentPreviewServerStarted items={componentServers} />
        <Newline />

        {mainUIServer ? null : <Starting componentServers={componentServers} />}

        <CompilingOrUIServersAreReady
          totalComponentsSum={this.state.componentServers.length}
          compiledComponentsSum={compiledComponents.length}
          mainUIServer={mainUIServer}
        />
      </>
    );
  }
}
