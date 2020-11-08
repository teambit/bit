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
// import type { MainUIServerDetails } from './output-templates/ui-servers-are-ready';

export type MainUIServerDetails = {
  uiRootName: string;
  isScope: boolean;
  targetHost: string;
  targetPort: number;
};

export type DevServer = {
  name: string | null;
  targetHost: string | undefined;
  targetPort: number;
  status: string | null;
  id: string;
};

type CliOutputState = {
  compiledComponents: Array<any>;
  commandFlags: any;
  mainUIServer: MainUIServerDetails | null;
  devServers: Array<DevServer>;
  webpackErrors: Array<any>;
  webpackWarnings: Array<any>;
  totalComponents: Array<any> | null;
  compiling: boolean;
};

export type CliOutputProps = {
  startingTimestamp: number;
  pubsub: PubsubMain;
  commandFlags: any;
  mainUIServer: MainUIServerDetails | null;
};

export class CliOutput extends React.Component<CliOutputProps, CliOutputState> {
  private isBrowserOpen = false;

  constructor(props: CliOutputProps) {
    super(props);
    this.state = {
      compiledComponents: [],
      commandFlags: props.commandFlags,
      mainUIServer: props.mainUIServer,
      devServers: [],
      webpackErrors: [],
      webpackWarnings: [],
      totalComponents: null,
      // isScope: props.mainUIServer?.isScope | null,
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
    // console.log('--->event: ', JSON.stringify(event));
    // console.log('--->event: ', event.type);

    switch (event.type) {
      case ComponentsServerStartedEvent.TYPE:
        this.onComponentsServerStarted(event as ComponentsServerStartedEvent);
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

  private onComponentsServerStarted(event: ComponentsServerStartedEvent) {
    const devServer: DevServer = {
      name: null,
      targetHost: event.data.hostname,
      targetPort: event.data.port,
      status: 'Starting...',
      id: event.data.id,
    };
    this.updateOrAddComponentServer(event.data.id, devServer);
    this.safeOpenBrowser();
  }

  private onUiServerStarted(event: UiServerStartedEvent) {
    // const devServers: DevServer[] = await event.data.uiRoot.devServers;
    const devServers: DevServer[] = event.data.devServers;

    // if (event.data.uiRoot.scope) {
    if (event.data.isScope) {
      this.setState({
        devServers: devServers,
        mainUIServer: event.data.mainUIServer,
        // isScope: true,
      });
    } else {
      // const totalComponents = await event.data.uiRoot.workspace.list();
      // const totalComponents = await this.state.mainUIServer.uiRoot.workspace.list()
      const totalComponents = event.data.componentList;
      this.setState({
        devServers: devServers,
        mainUIServer: event.data.mainUIServer,
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
    // this.updateOrAddComponentServer(event.data.devServerID, 'Running');
    this.updateOrAddComponentServer(event.data.devServerID, { status: 'Running' });
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
    return this.state.mainUIServer && this.state.devServers.every((cs) => cs.status === 'Running');
  }

  private clearConsole() {
    // process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H');
  }

  private async safeOpenBrowser() {
    const { suppressBrowserLaunch } = this.state.commandFlags;
    const { mainUIServer } = this.state;

    if (mainUIServer && !suppressBrowserLaunch && !!this.state.compiledComponents.length) {
      // TODO(uri): Bug two events for each server
      if (this.state.compiledComponents.length / 2 >= this.state.devServers.length) {
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

  private updateOrAddComponentServer(id: string, updates: Partial<DevServer>) {
    const _server = this.state.devServers.find((server) => server.id === id);
    if (_server) {
      const updatedServer: DevServer = Object.assign({}, _server, updates);

      this.setState({
        devServers: [...this.state.devServers.filter((server) => server.id !== id), updatedServer],
      });
    } else {
      const emptyServerDetails: DevServer = {
        name: null,
        targetHost: '',
        targetPort: 0,
        status: null,
        id: '',
      };

      const updatedServer: DevServer = Object.assign({}, emptyServerDetails, updates);

      this.setState({
        devServers: [...this.state.devServers, updatedServer],
      });
    }
  }

  render() {
    const { mainUIServer, devServers, webpackErrors, webpackWarnings, compiledComponents, compiling } = this.state;
    const { verbose } = this.state.commandFlags;

    // run in scope
    if (mainUIServer?.isScope) {
      render(<UIServersAreReadyInScope uiRootName={mainUIServer.uiRootName} port={mainUIServer.targetPort} />);
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
        <ComponentPreviewServerStarted devServers={devServers} />
        <Newline />

        {mainUIServer ? null : <Starting sumOfComponentServers={devServers.length} />}

        <CompilingOrUIServersAreReady
          totalComponentsSum={this.state.devServers.length}
          compiledComponentsSum={compiledComponents.length}
          mainUIServerDetails={mainUIServer}
        />
      </>
    );
  }
}
