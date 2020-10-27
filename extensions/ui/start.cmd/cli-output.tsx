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
  CompilingOrUIServersAreReady,
} from './output-templates';

type state = {
  compiledComponents: Array<any>;
  commandFlags: any;
  mainUIServer: any;
  componentServers: Array<any>;
  componentChanges: Array<any>;
  isBrowserOpen: boolean;
  latestError: any;
  webpackErrors: Array<any>;
  webpackWarnings: Array<any>;
  totalComponents: Array<any> | null;
  isScope: boolean;
};

export type props = {
  startingTimestamp: number;
  pubsub: PubsubMain;
  commandFlags: any;
  uiServer: any;
};

export class CliOutput extends React.Component<props, state> {
  constructor(props: props) {
    super(props);
    this.state = {
      compiledComponents: [],
      commandFlags: props.commandFlags,
      mainUIServer: props.uiServer,
      componentServers: [],
      componentChanges: [],
      isBrowserOpen: false,
      latestError: null,
      webpackErrors: [],
      webpackWarnings: [],
      totalComponents: null,
      isScope: !!props.uiServer?.uiRoot.scope,
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
        this.safeOpenBrowser();
        break;
      case WebpackCompilationDoneEvent.TYPE:
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

    if (!!event.data.uiRoot.scope) {
      this.setState({
        mainUIServer: event.data,
        isScope: true,
      });
    } else {
      const totalComponents = await event.data.uiRoot.workspace.list();
      devServers.forEach((server) => {
        this.changeOrAddComponentServer(server, server.context.id, 'Starting...');
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
    });
    this.safeOpenBrowser();
  };

  private onComponentChange(event) {
    this.setState({
      componentChanges: [...this.state.componentChanges, event],
      latestError: null,
      webpackErrors: [],
      webpackWarnings: [],
    });
  }

  private onComponentRemoved = (event) => {
    this.onComponentChange(event);
  };

  private onComponentAdd = (event) => {
    this.onComponentChange(event);
  };

  // Helpers

  private areAllComponentServersRunning() {
    return this.state.componentServers.every((cs) => cs.status === 'Running');
  }

  private async safeOpenBrowser() {
    const { suppressBrowserLaunch } = this.state.commandFlags;
    const { isBrowserOpen, mainUIServer } = this.state;

    if (mainUIServer && !isBrowserOpen && !suppressBrowserLaunch && !!this.state.compiledComponents.length) {
      // TODO(uri): Bug two events for each server
      if (this.state.compiledComponents.length / 2 >= this.state.componentServers.length) {
        this.unsafeOpenBrowser(mainUIServer);
      }
    }
  }

  private unsafeOpenBrowser(mainUIServer) {
    this.setState({ isBrowserOpen: true });
    setTimeout(() => open(`http://${mainUIServer.targetHost}:${mainUIServer.targetPort}/`), 500);
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
      latestError,
      webpackErrors,
      webpackWarnings,
      compiledComponents,
      totalComponents,
      isScope,
    } = this.state;
    const { verbose } = this.state.commandFlags;

    // run in scope
    if (isScope) {
      render(<UIServersAreReadyInScope mainUIServer={mainUIServer} />);
      return null;
    }

    return (
      <>
        {mainUIServer ? null : <Starting componentServers={componentServers} />}
        <Newline />

        <ComponentPreviewServerStarted items={componentServers} />
        <Newline />

        <TSErrors latestError={latestError} verbose={!!verbose} />

        <WebpackErrors errs={webpackErrors} verbose={!!verbose} />

        {webpackWarnings.map((warning, index) => (
          <Text key={index}>{warning}</Text>
        ))}

        <CompilingOrUIServersAreReady
          totalComponentsSum={this.state.componentServers.length}
          compiledComponentsSum={compiledComponents.length}
          mainUIServer={mainUIServer}
        />
      </>
    );
  }
}
