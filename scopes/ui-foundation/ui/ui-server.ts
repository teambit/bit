import { flatten } from 'lodash';
import { ExpressMain } from '@teambit/express';
import { GraphqlMain } from '@teambit/graphql';
import { Logger } from '@teambit/logger';
import express, { Express } from 'express';
import fallback from 'express-history-api-fallback';
import { Port } from '@teambit/toolbox.network.get-port';
import { stripTrailingChar } from '@teambit/toolbox.string.strip-trailing-char';
import { Server } from 'http';
import httpProxy from 'http-proxy';
import { join } from 'path';
import webpack from 'webpack';
import WebpackDevServer, { Configuration as WdsConfiguration } from 'webpack-dev-server';
import { createSsrMiddleware } from './ssr-middleware';
import { StartPlugin } from './start-plugin';
import { ProxyEntry, UIRoot } from './ui-root';
import { UIRuntime } from './ui.aspect';
import { UiMain } from './ui.main.runtime';

import { devConfig } from './webpack/webpack.dev.config';
import { ComponentServer } from '@teambit/bundler';

export type UIServerProps = {
  graphql: GraphqlMain;
  express: ExpressMain;
  ui: UiMain;
  uiRoot: UIRoot;
  uiRootExtension: string;
  logger: Logger;
  publicDir: string;
  startPlugins: StartPlugin[];
};

export type StartOptions = {
  /**
   * Absolute path to the ui bundle (generated during the bit build).
   */
  bundleUiRoot?: string;
  /**
   * port range for the UI server to bind. default is a port range of 4000-4200.
   */
  portRange?: number[] | number;
};

export class UIServer {
  private _app: Express;
  private _server: Server;

  constructor(
    private graphql: GraphqlMain,
    private expressExtension: ExpressMain,
    private ui: UiMain,
    private uiRoot: UIRoot,
    private uiRootExtension: string,
    private logger: Logger,
    private publicDir: string,
    private plugins: StartPlugin[]
  ) { }

  getName() {
    return this.uiRoot.name;
  }

  private _port = 0;

  get port() {
    return this._port;
  }

  /** the hostname for the server to listen at. Currently statically 'localhost' */
  get host() {
    return 'localhost';
  }

  /** the server listens at this url */
  get fullUrl() {
    const port = this.port !== 80 ? `:${this.port}` : '';
    return `http://${this.host}${port}`;
  }

  get buildOptions() {
    return this.uiRoot.buildOptions;
  }

  /**
   * get the webpack configuration of the UI server.
   */
  async getDevConfig() {
    const aspects = await this.uiRoot.resolveAspects(UIRuntime.name);

    return devConfig(this.uiRoot.path, [await this.ui.generateRoot(aspects, this.uiRootExtension)], this.uiRoot.name);
  }

  private setReady: () => void;
  private startPromise = new Promise<void>((resolve) => (this.setReady = resolve));
  get whenReady() {
    return Promise.all([this.startPromise, ...this.plugins.map((x) => x?.whenReady)]);
  }

  addComponentServerProxy(server: ComponentServer): void {
    if (!server || !server.context) {
      console.log('[DEBUG-PROXY] Cannot add proxy for invalid server');
      return;
    }
  
    const envId = server.context.envRuntime.id;
    console.log(`[DEBUG-PROXY] Adding proxy routes for component server: ${envId}`);
    console.log(`[DEBUG-PROXY] Server port: ${server.port}`);
  
    if (!this._app || !this._server) {
      console.log('[DEBUG-PROXY] Cannot add proxy routes - server not initialized');
      return;
    }
  
    const dynamicProxy = httpProxy.createProxyServer();
    
    dynamicProxy.on('error', (e) => {
      console.log(`[DEBUG-PROXY] Dynamic proxy error: ${e.message}`);
      this.logger.error(e.message);
    });
  
    const entries = [
      {
        context: [`/preview/${envId}`],
        target: `http://localhost:${server.port}`,
      },
      {
        context: [`/_hmr/${envId}`],
        target: `http://localhost:${server.port}`,
        ws: true,
      }
    ];
  
    const wsHandler = (req, socket, head) => {
      const reqUrl = req.url?.replace(/\?.+$/, '') || '';
      const path = stripTrailingChar(reqUrl, '/');
      
      const entry = entries.find((proxy) =>
        proxy.ws && proxy.context.some(item => {
          const itemPath = stripTrailingChar(item, '/');
          return path === itemPath || path.startsWith(itemPath);
        })
      );
      
      if (!entry) return;
      
      dynamicProxy.ws(req, socket, head, { target: entry.target });
    };
    
    this._server.on('upgrade', wsHandler);
  
    // Create an Express Router specifically for this component server
    const router = express.Router();
    
    // Set up the routes on this router
    entries.forEach((entry) => {
      entry.context.forEach((route) => {
        // Extract the path relative to this router
        // For example, if route is '/preview/bitdev.general/envs/bit-env@3.0.2'
        // we'll mount the router at that exact path and handle '/*' within it
        
        // Set up the route
        router.all('/*', (req, res) => {
          console.log(`[DEBUG-PROXY] Matched dynamic route ${route}/* for ${req.url}`);
          req.url = req.originalUrl;
          dynamicProxy.web(req, res, { target: entry.target });
        });
        
        // Mount this router at the exact route path, BEFORE any other middleware
        // This guarantees it will handle requests before any catch-all middleware
        console.log(`[DEBUG-PROXY] Setting up dynamic HTTP route: ${route}/* -> ${entry.target}`);
        
        // Insert this router at the beginning of the middleware stack
        const existingMiddleware = this._app._router.stack;
        this._app.use(route, router);
        
        // Now move it to the beginning 
        const lastMiddleware = existingMiddleware.pop();
        existingMiddleware.unshift(lastMiddleware);
      });
    });
  }

  /**
   * start a UI server.
   */
  async start({ bundleUiRoot, portRange }: StartOptions = {}) {
    const app = this.expressExtension.createApp();
    const publicDir = `/${this.publicDir}`;
    const defaultRoot = join(this.uiRoot.path, publicDir);
    const root = bundleUiRoot || defaultRoot;
    this.logger.debug(`UiServer, start from ${root}`);
    const server = await this.graphql.createServer({ app });

    // set up proxy, for things like preview, e.g. '/preview/teambit.react/react'
    await this.configureProxy(app, server);

    // pass through files from public /folder:
    // setting `index: false` so index.html will be served by the fallback() middleware
    app.use(express.static(root, { index: false }));

    const port = await Port.getPortFromRange(portRange || [3100, 3200]);

    await this.setupServerSideRendering({ root, port, app });

    // in any and all other cases, serve index.html.
    // No any other endpoints past this will execute
    app.use(fallback('index.html', { root }));

    server.listen(port);
    this._port = port;

    // important: we use the string of the following message for the http.e2e.ts. if you change the message,
    // please make sure you change the `HTTP_SERVER_READY_MSG` const.
    this.logger.info(`UI server of ${this.uiRootExtension} is listening to port ${port}`);

    this.setReady();
  }

  private async setupServerSideRendering({ root, port, app }: { root: string; port: number; app: Express }) {
    if (!this.buildOptions?.ssr) return;

    const ssrMiddleware = await createSsrMiddleware({
      root,
      port,
      title: this.uiRoot.name,
      logger: this.logger,
    });

    if (!ssrMiddleware) {
      this.logger.warn('[ssr] middleware failed setup');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    app.get('*', ssrMiddleware);
    this.logger.debug('[ssr] serving for "*"');
  }

  private async configureProxy(app: Express, server: Server) {
    console.trace("🚀 ~ UIServer ~ configureProxy ~ server:", server)

    const proxServer = httpProxy.createProxyServer();
    proxServer.on('error', (e) => this.logger.error(e.message));
    const proxyEntries = await this.getProxyFromPlugins();

    // TODO - should use https://github.com/chimurai/http-proxy-middleware
    server.on('upgrade', function (req, socket, head) {
      const entry = proxyEntries.find((proxy) =>
        proxy.context.some((item) => item === stripTrailingChar(req.url?.replace(/\?.+$/, '') as string, '/'))
      );
      if (!entry) return;
      proxServer.ws(req, socket, head, {
        target: entry.target,
      });
    });

    proxyEntries.forEach((entry) => {
      entry.context.forEach((route) => {
        app.use(`${route}/*`, (req, res) => {
          req.url = req.originalUrl;
          proxServer.web(req, res, entry);
        });
      });
    });

    this._app = app;
    this._server = server;
  }

  /**
   * start a UI dev server.
   */
  async dev({ portRange }: StartOptions = {}) {
    const devServerPort = await this.selectPort(portRange);
    await this.start({ portRange: [4100, 4200] });
    const expressAppPort = this._port;

    const config = await this.getDevConfig();
    const compiler = webpack(config as any);
    const devServerConfig = await this.getDevServerConfig(devServerPort, expressAppPort, config.devServer);
    // @ts-ignore in the capsules it throws an error about compatibilities issues between webpack.compiler and webpackDevServer/webpack/compiler
    const devServer = new WebpackDevServer(devServerConfig, compiler);

    await devServer.start();
    this._port = devServerPort;
    return devServer;
  }

  private async selectPort(portRange?: number[] | number) {
    return Port.getPortFromRange(portRange || [3100, 3200]);
  }

  private async getProxyFromPlugins(): Promise<ProxyEntry[]> {
    const proxiesByPlugin = this.plugins.map((plugin) => {
      return plugin.getProxy ? plugin.getProxy() : [];
    });

    return flatten(await Promise.all(proxiesByPlugin));
  }

  private async getProxy(port = 4000) {
    const proxyEntries = await this.getProxyFromPlugins();

    const gqlProxies: ProxyEntry[] = [
      {
        context: ['/graphql', '/api'],
        target: `http://${this.host}:${port}`,
        changeOrigin: true,
      },
      {
        context: ['/subscriptions'],
        target: `ws://${this.host}:${port}`,
        ws: true,
      },
    ];

    return gqlProxies.concat(proxyEntries);
  }

  private async getDevServerConfig(
    appPort: number,
    gqlPort: number,
    config?: WdsConfiguration
  ): Promise<WdsConfiguration> {
    const proxy = await this.getProxy(gqlPort);
    const devServerConf = { ...config, proxy, port: appPort };

    return devServerConf;
  }

  static create(props: UIServerProps) {
    return new UIServer(
      props.graphql,
      props.express,
      props.ui,
      props.uiRoot,
      props.uiRootExtension,
      props.logger,
      props.publicDir,
      props.startPlugins
    );
  }
}
