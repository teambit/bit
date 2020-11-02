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
import { Newline, Text, render } from 'ink';
import open from 'open';

import {
  Starting,
  ComponentPreviewServerStarted,
  UIServersAreReadyInScope,
  TSErrors,
  WebpackErrors,
  WebpackWarnings,
  CompilingOrUIServersAreReady,
} from './output-templates';

type state = {
  compiledComponents: Array<any>;
  commandFlags: any;
  mainUIServer: any;
  componentServers: Array<any>;
  componentChanges: Array<any>;
  latestError: any;
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
      componentChanges: [],
      latestError: null,
      webpackErrors: [],
      webpackWarnings: [],
      totalComponents: null,
      isScope: !!props.uiServer?.uiRoot.scope,
      compiling: false,
    };

    this.registerToEvents(props.pubsub);
  }

  private registerToEvents(pubsub: PubsubMain) {
    pubsub.sub(UIAspect.id, this.eventsListener);
    pubsub.sub(WebpackAspect.id, this.eventsListener);
    pubsub.sub(BundlerAspect.id, this.eventsListener);
    pubsub.sub(WorkspaceAspect.id, this.eventsListener);
    pubsub.sub(CompilerAspect.id, this.eventsListener);
  }

  private eventsListener = async (event: BitBaseEvent<any>) => {
    switch (event.type) {
      case ComponentsServerStartedEvent.TYPE:
        this.updateOrAddComponentServer(event.data.context.id, 'Running', event.data);
        this.safeOpenBrowser();
        break;
      case WebpackCompilationDoneEvent.TYPE:
        this.onWebpackCompilationDone(event);
        break;
      case UiServerStartedEvent.TYPE:
        await this.onUiServerStarted(event);
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
          compiling: false,
        });
        break;
      default:
    }
  };

  private async onUiServerStarted(event) {
    const devServers = await event.data.uiRoot.devServers;

    if (event.data.uiRoot.scope) {
      this.setState({
        mainUIServer: event.data,
        isScope: true,
      });
    } else {
      const totalComponents = await event.data.uiRoot.workspace.list();
      devServers.forEach((server) => {
        this.updateOrAddComponentServer(server.context.id, 'Starting...', server);
      });
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

  private onWebpackCompilationDone = (event) => {
    const successfullyCompiledComponents = event.data.stats.compilation.errors.length ? [] : [event.data.stats.hash];
    this.setState({
      webpackErrors: [...event.data.stats.compilation.errors],
      webpackWarnings: [...event.data.stats.compilation.warnings],
      compiledComponents: [...this.state.compiledComponents, ...successfullyCompiledComponents],
      compiling: false,
    });
    this.updateOrAddComponentServer(event.data.devServerID, 'Done');
    this.safeOpenBrowser();
  };

  private onComponentChange(event) {
    this.clearConsole();

    this.setState({
      componentChanges: [...this.state.componentChanges, event],
      latestError: null,
      webpackErrors: [],
      webpackWarnings: [],
      compiling: true,
    });
  }

  private onComponentRemoved = (event) => {
    this.onComponentChange(event);
  };

  private onComponentAdd = (event) => {
    this.onComponentChange(event);
  };

  // Helpers
  private clearConsole() {
    process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H');
  }

  private safeOpenBrowser() {
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
      latestError,
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

    if (latestError) {
      return <TSErrors latestError={latestError} verbose={!!verbose} />;
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
        {mainUIServer ? null : <Starting componentServers={componentServers} />}
        <Newline />

        <ComponentPreviewServerStarted items={componentServers} />
        <Newline />

        <CompilingOrUIServersAreReady
          totalComponentsSum={this.state.componentServers.length}
          compiledComponentsSum={compiledComponents.length}
          mainUIServer={mainUIServer}
        />
      </>
    );
  }
}
